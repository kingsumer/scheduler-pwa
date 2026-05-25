/**
 * 排课App - 主界面逻辑 v2.1
 * 参考「叮当记账助手」UI重构
 */

// ==================== 全局状态 ====================
let currentWeekStart = null;
let calendarDate = null; // 日历显示的月份
let institutions = [];
let students = [];
let courses = [];
let selectedCourseId = null;
let currentStatsRange = 'month';
let currentStatsView = 'overview';
let currentHistoryView = 'list';

const COLORS = [
    '#4A90D9', '#E74C3C', '#27AE60', '#F39C12', '#9B59B6',
    '#1ABC9C', '#E67E22', '#3498DB', '#E91E63', '#00BCD4',
    '#8BC34A', '#FF5722', '#607D8B', '#795548', '#CDDC39'
];
const DAY_NAMES = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const GRADE_NAMES = [
    '一年级', '二年级', '三年级', '四年级', '五年级', '六年级',
    '初一', '初二', '初三', '高一', '高二', '高三'
];

// ==================== 时间工具 ====================
function addHoursToTime(timeStr, hours) {
    const [h, m] = timeStr.split(':').map(Number);
    let totalMins = h * 60 + m + hours * 60;
    totalMins = ((totalMins % 1440) + 1440) % 1440;
    const newH = Math.floor(totalMins / 60);
    const newM = totalMins % 60;
    return `${String(newH).padStart(2,'0')}:${String(newM).padStart(2,'0')}`;
}

function autoSetEndTime(startId, endId) {
    const startEl = document.getElementById(startId);
    const endEl = document.getElementById(endId);
    if (startEl && endEl && startEl.value) {
        endEl.value = addHoursToTime(startEl.value, 2);
    }
}

function autoSetEndTimeAC() {
    const startEl = document.getElementById('ac-start');
    const endEl = document.getElementById('ac-end');
    const durationEl = document.getElementById('ac-duration');
    if (startEl && endEl && startEl.value) {
        const hours = parseFloat(durationEl.value) || 2;
        endEl.value = addHoursToTime(startEl.value, hours);
    }
    // 自动计算费用
    calcACFee();
}

// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await initDB();
        // 数据库迁移：添加新字段
        migrateDB();
        initWeek();
        calendarDate = new Date();
        setupTabs();
        await loadAllData();
        renderCalendar();
        renderTodayCourses();
        // 设置记一笔的默认日期
        document.getElementById('ac-date').value = todayStr();
    } catch (e) {
        console.error('初始化失败:', e);
        showToast('初始化失败: ' + e.message);
    }
});

function migrateDB() {
    // 为courses表添加备注和反馈字段
    try { db.run(`ALTER TABLE courses ADD COLUMN note TEXT DEFAULT ''`); } catch(e) {}
    try { db.run(`ALTER TABLE courses ADD COLUMN feedback TEXT DEFAULT ''`); } catch(e) {}
    try { db.run(`ALTER TABLE courses ADD COLUMN is_settled INTEGER DEFAULT 0`); } catch(e) {}
    try { db.run(`ALTER TABLE courses ADD COLUMN course_type TEXT DEFAULT '1v1'`); } catch(e) {}
    // 为institutions表添加状态字段
    try { db.run(`ALTER TABLE institutions ADD COLUMN status TEXT DEFAULT 'active'`); } catch(e) {}
    try { db.run(`ALTER TABLE institutions ADD COLUMN settlement_type TEXT DEFAULT 'monthly'`); } catch(e) {}
    try { db.run(`ALTER TABLE institutions ADD COLUMN is_default INTEGER DEFAULT 0`); } catch(e) {}
    // 为students表添加年级字段
    try { db.run(`ALTER TABLE students ADD COLUMN grade TEXT DEFAULT ''`); } catch(e) {}
    // 为students表添加学生类型字段（1v1或class）
    try { db.run(`ALTER TABLE students ADD COLUMN student_type TEXT DEFAULT '1v1'`); } catch(e) {}
    // app_meta
    try { db.run(`INSERT OR REPLACE INTO app_meta (key, value) VALUES ('nickname', '')`); } catch(e) {}
    try { db.run(`INSERT OR REPLACE INTO app_meta (key, value) VALUES ('db_version', '5')`); } catch(e) {}
}

function setupTabs() {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;
            switchTab(tabName);
        });
    });
}

function switchTab(tabName) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.page:not(.subpage)').forEach(p => p.classList.remove('active'));
    const targetTab = document.querySelector(`.tab[data-tab="${tabName}"]`);
    if (targetTab) targetTab.classList.add('active');
    const targetPage = document.getElementById('page-' + tabName);
    if (targetPage) targetPage.classList.add('active');

    // 关闭子页面
    document.querySelectorAll('.subpage').forEach(p => p.classList.remove('active'));

    if (tabName === 'stats') refreshStats();
    if (tabName === 'home') { renderCalendar(); renderTodayCourses(); refreshHomeStats(); }
    if (tabName === 'addcourse') refreshAddCourseForm();
}

// 子页面
function openSubPage(pageName) {
    const page = document.getElementById('page-' + pageName);
    if (page) page.classList.add('active');
}
function closeSubPage(pageName) {
    const page = document.getElementById('page-' + pageName);
    if (page) page.classList.remove('active');
}

// ==================== 日期工具 ====================
function formatDate(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function formatDateCN(d) {
    return `${d.getMonth()+1}月${d.getDate()}日`;
}

// ==================== 周导航 ====================
function initWeek() {
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1);
    currentWeekStart = new Date(today);
    currentWeekStart.setDate(diff);
    currentWeekStart.setHours(0,0,0,0);
    updateWeekDisplay();
    renderScheduleGrid();
}

function prevWeek() {
    currentWeekStart = new Date(currentWeekStart.getTime() - 7*86400000);
    updateWeekDisplay();
    renderScheduleGrid();
    loadCourses();
}

function nextWeek() {
    currentWeekStart = new Date(currentWeekStart.getTime() + 7*86400000);
    updateWeekDisplay();
    renderScheduleGrid();
    loadCourses();
}

function goToday() {
    initWeek();
    loadCourses();
}

function updateWeekDisplay() {
    const end = new Date(currentWeekStart.getTime() + 6*86400000);
    document.getElementById('current-week').textContent =
        `${formatDateCN(currentWeekStart)} - ${formatDateCN(end)}`;
    const dayLabels = ['一', '二', '三', '四', '五', '六', '日'];
    const ths = document.querySelectorAll('#schedule-grid thead th');
    for (let i = 0; i < 7; i++) {
        const d = new Date(currentWeekStart.getTime() + i * 86400000);
        ths[i + 1].innerHTML = `${dayLabels[i]}<br><span style="font-size:11px;font-weight:normal;color:var(--text-secondary)">${d.getMonth()+1}/${d.getDate()}</span>`;
    }
}

// ==================== 数据加载 ====================
async function loadAllData() {
    institutions = InstitutionDB.getAll();
    students = StudentDB.getAll();
    buildStudentColorMap();
    await loadCourses();
    refreshHomeStats();
}

async function loadCourses() {
    const start = formatDate(currentWeekStart);
    const end = formatDate(new Date(currentWeekStart.getTime() + 6*86400000));
    courses = CourseDB.getByDateRange(start, end);
    renderCourses();
}

// ==================== 首页 ====================
function refreshHomeStats() {
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
    const monthEnd = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-31`;
    const monthCourses = CourseDB.getByDateRange(monthStart, monthEnd);

    let totalHours = 0, totalIncome = 0;
    for (const c of monthCourses) {
        totalHours += c.duration_hours;
        totalIncome += c.fee;
    }

    document.getElementById('home-month-hours').textContent = `${totalHours.toFixed(1)}小时`;
    document.getElementById('home-month-income').textContent = `¥${totalIncome.toFixed(0)}`;

    // 计算已结算/待结算
    let settled = 0;
    for (const inst of institutions) {
        settled += SalaryDB.getSettledAmount(inst.id);
    }
    const pending = Math.max(0, totalIncome - settled);
    document.getElementById('home-settled').textContent = `¥${settled.toFixed(0)}`;
    document.getElementById('home-pending').textContent = `¥${pending.toFixed(0)}`;
}

// ==================== 日历 ====================
function renderCalendar() {
    if (!calendarDate) calendarDate = new Date();
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();

    document.getElementById('calendar-title').textContent = `${year}年${month+1}月`;

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDay = firstDay.getDay(); // 0=Sun

    // 获取本月有课程的日期
    const monthStart = formatDate(firstDay);
    const monthEnd = formatDate(lastDay);
    const monthCourses = CourseDB.getByDateRange(monthStart, monthEnd);
    const courseDates = new Set(monthCourses.map(c => c.course_date));

    const today = formatDate(new Date());
    const grid = document.getElementById('calendar-grid');
    let html = '';

    // 上月补齐
    const prevLast = new Date(year, month, 0);
    for (let i = startDay - 1; i >= 0; i--) {
        const d = prevLast.getDate() - i;
        html += `<div class="calendar-day other-month">${d}</div>`;
    }

    // 本月
    for (let d = 1; d <= lastDay.getDate(); d++) {
        const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const isToday = dateStr === today;
        const hasCourse = courseDates.has(dateStr);
        let cls = 'calendar-day';
        if (isToday) cls += ' today';
        if (hasCourse) cls += ' has-course';
        html += `<div class="${cls}" onclick="calendarDayClick('${dateStr}')">${d}</div>`;
    }

    // 下月补齐
    const totalCells = startDay + lastDay.getDate();
    const remain = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    for (let d = 1; d <= remain; d++) {
        html += `<div class="calendar-day other-month">${d}</div>`;
    }

    grid.innerHTML = html;
}

function calendarPrev() {
    calendarDate.setMonth(calendarDate.getMonth() - 1);
    renderCalendar();
}

function calendarNext() {
    calendarDate.setMonth(calendarDate.getMonth() + 1);
    renderCalendar();
}

function calendarDayClick(dateStr) {
    // 跳到课表页并定位到该周
    const d = new Date(dateStr + 'T00:00:00');
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    currentWeekStart = new Date(d);
    currentWeekStart.setDate(diff);
    currentWeekStart.setHours(0,0,0,0);
    updateWeekDisplay();
    renderScheduleGrid();
    loadCourses();
    switchTab('schedule');
}

function renderTodayCourses() {
    const today = todayStr();
    const todayCoursesList = CourseDB.getByDateRange(today, today);
    const container = document.getElementById('today-courses');

    if (todayCoursesList.length === 0) {
        container.innerHTML = '<div class="empty-tip" style="padding:20px">今日暂无课程</div>';
        return;
    }

    container.innerHTML = todayCoursesList.map(c => `
        <div class="today-course-item" onclick="showCourseDetail(${c.id})">
            <div class="today-course-dot" style="background:${getStudentColor(c.student_id)}"></div>
            <div class="today-course-info">
                <div class="today-course-name">${c.student_name}</div>
                <div class="today-course-sub">${c.institution_name || ''} · ${c.start_time}-${c.end_time}</div>
            </div>
            <div class="today-course-fee">¥${c.fee.toFixed(0)}</div>
        </div>
    `).join('');
}

function showCourseDetail(courseId) {
    const c = CourseDB.getById(courseId);
    if (!c) return;
    openModal('课程详情', `
        <div style="padding:8px 0">
            <p><b>学生：</b>${c.student_name}</p>
            <p><b>机构：</b>${c.institution_name || '未知'}</p>
            <p><b>日期：</b>${c.course_date}</p>
            <p><b>时间：</b>${c.start_time} - ${c.end_time}</p>
            <p><b>时长：</b>${c.duration_hours.toFixed(1)}小时</p>
            <p><b>课时费：</b>¥${c.fee.toFixed(0)}</p>
            ${c.note ? `<p><b>备注：</b>${c.note}</p>` : ''}
            ${c.feedback ? `<p><b>反馈：</b>${c.feedback}</p>` : ''}
        </div>
    `);
}

// ==================== 渲染课表 ====================
function renderScheduleGrid() {
    const tbody = document.getElementById('schedule-body');
    tbody.innerHTML = '';
    const today = formatDate(new Date());
    
    for (let hour = 7; hour < 24; hour++) {
        for (let half = 0; half < 2; half++) {
            const tr = document.createElement('tr');
            const timeStr = `${String(hour).padStart(2,'0')}:${half===0?'00':'30'}`;
            
            const tdTime = document.createElement('td');
            tdTime.className = 'time-col';
            tdTime.textContent = timeStr;
            tr.appendChild(tdTime);
            
            for (let day = 1; day <= 7; day++) {
                const td = document.createElement('td');
                td.dataset.day = day;
                td.dataset.time = timeStr;
                td.style.position = 'relative';
                
                const cellDate = new Date(currentWeekStart.getTime() + (day-1)*86400000);
                if (formatDate(cellDate) === today) td.classList.add('today-col');
                
                td.addEventListener('click', () => {
                    const dateStr = formatDate(new Date(currentWeekStart.getTime() + (day-1)*86400000));
                    openAddCourse(dateStr, timeStr);
                });
                
                tr.appendChild(td);
            }
            tbody.appendChild(tr);
        }
    }
}

// ==================== 课程拖动 ====================
let _dragging = null;
let _dragMoved = false;

function initCourseDrag(block, course) {
    let startX = 0, startY = 0;
    let pressTimer = null;
    let isDragging = false;

    block.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1) return;
        const t = e.touches[0];
        startX = t.clientX;
        startY = t.clientY;
        _dragMoved = false;
        isDragging = false;

        pressTimer = setTimeout(() => {
            isDragging = true;
            _dragMoved = true;
            e.preventDefault();
            startDrag(course, t, block);
        }, 300);
    }, { passive: false });

    block.addEventListener('touchmove', (e) => {
        if (isDragging && _dragging) {
            e.preventDefault();
            e.stopPropagation();
            moveDrag(e.touches[0]);
            return;
        }
        if (pressTimer) {
            const t = e.touches[0];
            if (Math.abs(t.clientX - startX) > 8 || Math.abs(t.clientY - startY) > 8) {
                clearTimeout(pressTimer);
                pressTimer = null;
            }
        }
    }, { passive: false });

    block.addEventListener('touchend', (e) => {
        clearTimeout(pressTimer);
        if (isDragging && _dragging) {
            e.preventDefault();
            endDrag();
        }
        isDragging = false;
    }, { passive: false });
}

function startDrag(course, touch, block) {
    _dragging = { course, sourceBlock: block };

    const ghost = document.createElement('div');
    ghost.id = 'drag-ghost';
    ghost.innerHTML = `${course.student_name}<br>${course.start_time}-${course.end_time}`;
    ghost.style.cssText = `
        position:fixed; z-index:9999; pointer-events:none;
        background:${getStudentColor(course.student_id)};
        color:${getContrastColor(getStudentColor(course.student_id))};
        padding:10px 14px; border-radius:10px; font-size:12px; font-weight:500;
        box-shadow:0 6px 20px rgba(0,0,0,0.35); opacity:0.92;
        left:${touch.clientX - 55}px; top:${touch.clientY - 35}px;
        min-width:90px; text-align:center; line-height:1.4;
        transition:none;
    `;
    document.body.appendChild(ghost);
    _dragging.ghost = ghost;

    block.style.opacity = '0.25';
    block.style.transition = 'opacity 0.15s';

    // 震动反馈（如果支持）
    if (navigator.vibrate) navigator.vibrate(30);
}

function moveDrag(touch) {
    if (!_dragging || !_dragging.ghost) return;
    _dragging.ghost.style.left = (touch.clientX - 55) + 'px';
    _dragging.ghost.style.top = (touch.clientY - 35) + 'px';

    // 高亮目标单元格
    document.querySelectorAll('#schedule-body td.highlight-drop').forEach(td => td.classList.remove('highlight-drop'));
    // 临时隐藏ghost以获取下方元素
    _dragging.ghost.style.display = 'none';
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    _dragging.ghost.style.display = '';
    if (el) {
        const td = el.closest('td[data-day]');
        if (td) td.classList.add('highlight-drop');
    }
}

function endDrag() {
    if (!_dragging) return;

    const ghost = _dragging.ghost;
    const course = _dragging.course;
    const sourceBlock = _dragging.sourceBlock;

    let targetTd = null;
    if (ghost) {
        const rect = ghost.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        ghost.style.display = 'none';
        const el = document.elementFromPoint(cx, cy);
        if (el) targetTd = el.closest('td[data-day]');
        ghost.remove();
    }

    // 清除高亮
    document.querySelectorAll('#schedule-body td.highlight-drop').forEach(td => td.classList.remove('highlight-drop'));
    if (sourceBlock) { sourceBlock.style.opacity = '1'; sourceBlock.style.transition = ''; }

    if (targetTd) {
        const day = parseInt(targetTd.dataset.day);
        const time = targetTd.dataset.time;
        const newDate = formatDate(new Date(currentWeekStart.getTime() + (day - 1) * 86400000));

        // 保持原时长
        const [sH, sM] = course.start_time.split(':').map(Number);
        const [eH, eM] = course.end_time.split(':').map(Number);
        let durationMins = (eH * 60 + eM) - (sH * 60 + sM);
        if (durationMins <= 0) durationMins += 1440;

        const [tH, tM] = time.split(':').map(Number);
        const newStartMin = tH * 60 + tM;
        const newEndMin = newStartMin + durationMins;
        const newStart = `${String(Math.floor(newStartMin / 60) % 24).padStart(2, '0')}:${String(newStartMin % 60).padStart(2, '0')}`;
        const newEnd = `${String(Math.floor(newEndMin / 60) % 24).padStart(2, '0')}:${String(newEndMin % 60).padStart(2, '0')}`;

        // 冲突检测
        const conflicts = ConflictDB.checkOverlap(newDate, newStart, newEnd, course.id);
        if (conflicts.length > 0) {
            const info = conflicts.map(c => `${c.student_name} ${c.start_time}-${c.end_time}`).join('\n');
            if (!confirm(`⚠️ 时间冲突！\n${info}\n\n是否继续移动？`)) {
                loadCourses();
                _dragging = null;
                return;
            }
        }

        CourseDB.update(course.id, {
            student_id: course.student_id,
            course_date: newDate,
            start_time: newStart,
            end_time: newEnd
        });
        loadCourses();
        showToast(`已移动至 ${newStart}`);
    } else {
        loadCourses();
    }
    _dragging = null;
}

function renderCourses() {
    document.querySelectorAll('.course-block').forEach(el => el.remove());
    
    courses.forEach(course => {
        const dayNum = (() => {
            const d = new Date(course.course_date + 'T00:00:00');
            return d.getDay() === 0 ? 7 : d.getDay();
        })();
        
        const [startH, startM] = course.start_time.split(':').map(Number);
        const [endH, endM] = course.end_time.split(':').map(Number);
        const startRow = (startH - 7) * 2 + (startM >= 30 ? 1 : 0);
        const endH_adj = endH === 0 ? 24 : endH;
        const endRow = (endH_adj - 7) * 2 + (endM >= 30 ? 1 : 0);
        const maxRow = 34;
        const rowSpan = Math.max(1, Math.min(endRow - startRow, maxRow - startRow));
        
        const tbody = document.getElementById('schedule-body');
        const rows = tbody.querySelectorAll('tr');
        
        if (startRow >= 0 && startRow < rows.length) {
            const td = rows[startRow].querySelector(`td[data-day="${dayNum}"]`);
            if (td) {
                const block = document.createElement('div');
                block.className = 'course-block';
                block.style.height = `${rowSpan * 32 - 3}px`;
                block.style.backgroundColor = getStudentColor(course.student_id);
                block.style.color = getContrastColor(getStudentColor(course.student_id));
                
                block.innerHTML = `
                    <div class="student-name">${course.student_name}</div>
                    <div class="inst-name">${course.institution_name}</div>
                    <div class="course-time">${course.start_time}</div>
                `;
                
                block.addEventListener('click', (e) => {
                    if (_dragMoved) return; // 拖动后不触发点击
                    e.stopPropagation();
                    showCoursePopup(e, course);
                });
                
                // 绑定拖动
                initCourseDrag(block, course);
                
                td.appendChild(block);
            }
        }
    });
}

function getContrastColor(hex) {
    const h = hex.replace('#','');
    const r = parseInt(h.substr(0,2),16);
    const g = parseInt(h.substr(2,2),16);
    const b = parseInt(h.substr(4,2),16);
    return (0.299*r + 0.587*g + 0.114*b)/255 > 0.5 ? '#333' : '#fff';
}

// 机构色系深浅
let _studentColorMap = {};
function hexToHSL(hex) {
    let r = parseInt(hex.substr(1,2),16)/255;
    let g = parseInt(hex.substr(3,2),16)/255;
    let b = parseInt(hex.substr(5,2),16)/255;
    const max = Math.max(r,g,b), min = Math.min(r,g,b);
    let h, s, l = (max+min)/2;
    if (max === min) { h = s = 0; }
    else {
        const d = max - min;
        s = l > 0.5 ? d/(2-max-min) : d/(max+min);
        switch (max) {
            case r: h = ((g-b)/d + (g<b?6:0))/6; break;
            case g: h = ((b-r)/d + 2)/6; break;
            case b: h = ((r-g)/d + 4)/6; break;
        }
    }
    return { h: Math.round(h*360), s: Math.round(s*100), l: Math.round(l*100) };
}
function hslToHex(h, s, l) {
    s /= 100; l /= 100;
    const a = s * Math.min(l, 1-l);
    const f = n => {
        const k = (n + h/30) % 12;
        const color = l - a * Math.max(Math.min(k-3, 9-k, 1), -1);
        return Math.round(255 * color).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
}
function buildStudentColorMap() {
    _studentColorMap = {};
    const instStudents = {};
    for (const s of students) {
        const instId = s.institution_id || 0;
        if (!instStudents[instId]) instStudents[instId] = [];
        instStudents[instId].push(s);
    }
    for (const instId in instStudents) {
        const group = instStudents[instId].sort((a,b) => a.id - b.id);
        const baseColor = group[0].institution_color || '#4A90D9';
        const hsl = hexToHSL(baseColor);
        const count = group.length;
        group.forEach((s, i) => {
            if (count === 1) {
                _studentColorMap[s.id] = baseColor;
            } else {
                const lightness = 75 - (i * 40 / (count - 1));
                _studentColorMap[s.id] = hslToHex(hsl.h, hsl.s, Math.round(lightness));
            }
        });
    }
}
function getStudentColor(studentId) {
    return _studentColorMap[studentId] || '#4A90D9';
}

// ==================== 课程点击弹窗 ====================
function showCoursePopup(e, course) {
    removeCoursePopup();
    const popup = document.createElement('div');
    popup.className = 'course-popup';
    popup.id = 'course-popup';
    const rect = e.target.getBoundingClientRect();
    popup.style.left = Math.min(rect.left, window.innerWidth - 220) + 'px';
    popup.style.top = Math.min(rect.bottom + 4, window.innerHeight - 200) + 'px';
    popup.innerHTML = `
        <div class="title">${course.student_name}</div>
        <div class="detail">${course.institution_name}</div>
        <div class="detail">${course.course_date} ${course.start_time}-${course.end_time}</div>
        <div class="detail">${course.duration_hours.toFixed(1)}小时 · ¥${course.fee.toFixed(0)}</div>
        <div class="popup-actions">
            <button style="background:var(--primary);color:#fff" onclick="editCourse(${course.id})">编辑</button>
            <button style="background:var(--danger);color:#fff" onclick="confirmDeleteCourse(${course.id})">删除</button>
            <button style="background:var(--bg)" onclick="removeCoursePopup()">关闭</button>
        </div>
    `;
    document.body.appendChild(popup);
    setTimeout(() => { document.addEventListener('click', removeCoursePopup, { once: true }); }, 10);
}

function removeCoursePopup() {
    const p = document.getElementById('course-popup');
    if (p) p.remove();
}

// ==================== 弹窗系统 ====================
function openModal(title, bodyHTML) {
    document.getElementById('modal-title').textContent = title;
    const bodyEl = document.getElementById('modal-body');
    const footerEl = document.getElementById('modal-footer');
    bodyEl.innerHTML = bodyHTML;
    const actions = bodyEl.querySelector('.form-actions');
    if (actions) {
        actions.remove();
        footerEl.innerHTML = '';
        footerEl.appendChild(actions);
        footerEl.style.display = 'block';
    } else {
        footerEl.innerHTML = '';
        footerEl.style.display = 'none';
    }
    document.getElementById('modal-overlay').classList.add('show');
}

function closeModal() {
    document.getElementById('modal-overlay').classList.remove('show');
    document.getElementById('modal-footer').innerHTML = '';
    document.getElementById('modal-footer').style.display = 'none';
}

function showToast(msg) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2000);
}

// ==================== 添加课程 ====================
function openAddCourse(dateStr, timeStr) {
    const date = dateStr || formatDate(new Date());
    const time = timeStr || '09:00';
    const endTime = addHoursToTime(time, 2);
    const studentOptions = students.map(s =>
        `<option value="${s.id}">${s.name} (${s.institution_name || '未知机构'})</option>`
    ).join('');
    openModal('临时加课', `
        <div class="form-group">
            <label>学生</label>
            <select id="course-student">${studentOptions}</select>
        </div>
        <div class="form-group">
            <label>日期</label>
            <input type="date" id="course-date" value="${date}">
        </div>
        <div class="form-group">
            <label>时间</label>
            <div class="time-row">
                <input type="time" id="course-start" value="${time}" onchange="autoSetEndTime('course-start','course-end')">
                <span>至</span>
                <input type="time" id="course-end" value="${endTime}">
            </div>
        </div>
        <div class="form-actions">
            <button class="btn outline" onclick="closeModal()">取消</button>
            <button class="btn primary" onclick="saveCourse()">保存</button>
        </div>
    `);
}

function saveCourse() {
    try {
        const data = {
            student_id: parseInt(document.getElementById('course-student').value),
            course_date: document.getElementById('course-date').value,
            start_time: document.getElementById('course-start').value,
            end_time: document.getElementById('course-end').value
        };
        const conflicts = ConflictDB.checkOverlap(data.course_date, data.start_time, data.end_time);
        if (conflicts.length > 0) {
            const conflictInfo = conflicts.map(c => `${c.student_name} ${c.start_time}-${c.end_time}`).join('\\n');
            if (!confirm(`时间冲突！\\n${conflictInfo}\\n是否继续？`)) return;
        }
        CourseDB.create(data);
        closeModal();
        loadCourses();
        showToast('课程已添加');
    } catch (e) { showToast(e.message); }
}

// ==================== 记一笔 ====================
function refreshAddCourseForm() {
    document.getElementById('ac-date').value = todayStr();
    // 填充机构下拉
    const instSelect = document.getElementById('ac-institution');
    instSelect.innerHTML = institutions.map(i =>
        `<option value="${i.id}">${i.name}</option>`
    ).join('');
    refreshACStudents();
    calcACFee();
}

function refreshACStudents() {
    const instId = parseInt(document.getElementById('ac-institution').value);
    const filteredStudents = students.filter(s => s.institution_id === instId);
    const stuSelect = document.getElementById('ac-student');
    stuSelect.innerHTML = filteredStudents.map(s =>
        `<option value="${s.id}">${s.name}</option>`
    ).join('');
    calcACFee();
}

// 监听机构变化刷新学生列表
document.addEventListener('change', (e) => {
    if (e.target.id === 'ac-institution') refreshACStudents();
    if (e.target.id === 'ac-student' || e.target.id === 'ac-duration') calcACFee();
});

function calcACFee() {
    const stuId = parseInt(document.getElementById('ac-student')?.value);
    const duration = parseFloat(document.getElementById('ac-duration')?.value) || 2;
    const stu = students.find(s => s.id === stuId);
    if (stu) {
        const fee = StudentDB.calculateFee(stu, duration);
        document.getElementById('ac-fee').value = fee.toFixed(0);
    }
}

function autoFeedback() {
    const stuId = parseInt(document.getElementById('ac-student')?.value);
    const stu = students.find(s => s.id === stuId);
    const date = document.getElementById('ac-date').value;
    if (stu) {
        document.getElementById('ac-feedback').value =
            `${date} ${stu.name}课后反馈：本次课程表现良好，知识点掌握扎实，继续保持。`;
    }
}

function toggleACRecurring() {
    const checked = document.getElementById('ac-recurring').checked;
    document.getElementById('ac-recurring-fields').style.display = checked ? '' : 'none';
}

function toggleACEndMode() {
    const mode = document.getElementById('ac-end-mode').value;
    document.getElementById('ac-weeks-field').style.display = mode === 'weeks' ? '' : 'none';
    document.getElementById('ac-date-field').style.display = mode === 'date' ? '' : 'none';
}

function saveFromAddCourse() {
    try {
        const studentId = parseInt(document.getElementById('ac-student').value);
        const date = document.getElementById('ac-date').value;
        const startTime = document.getElementById('ac-start').value;
        const endTime = document.getElementById('ac-end').value;
        const note = document.getElementById('ac-note').value;
        const feedback = document.getElementById('ac-feedback').value;
        const courseType = document.getElementById('ac-type').value;
        const isRecurring = document.getElementById('ac-recurring')?.checked;

        if (!studentId) { showToast('请选择学生'); return; }

        // 冲突检测
        const conflicts = ConflictDB.checkOverlap(date, startTime, endTime);
        if (conflicts.length > 0) {
            const conflictInfo = conflicts.map(c => `${c.student_name} ${c.start_time}-${c.end_time}`).join('\n');
            if (!confirm(`⚠️ 时间冲突！\n${conflictInfo}\n\n是否继续？`)) return;
        }

        if (isRecurring) {
            // 保存为循环课程
            const frequency = document.getElementById('ac-frequency').value;
            const endMode = document.getElementById('ac-end-mode').value;
            const weeks = parseInt(document.getElementById('ac-weeks')?.value) || 8;
            const endDate = document.getElementById('ac-end-date')?.value || '';
            const d = new Date(date + 'T00:00:00');
            const dayOfWeek = d.getDay() === 0 ? 7 : d.getDay();

            let genEndDate;
            if (endMode === 'weeks') {
                genEndDate = formatDate(new Date(d.getTime() + weeks * 7 * 86400000));
            } else {
                genEndDate = endDate || formatDate(new Date(d.getTime() + 60 * 86400000));
            }

            const patternId = PatternDB.create({
                student_id: studentId,
                day_of_week: dayOfWeek,
                start_time: startTime,
                end_time: endTime,
                start_date: date,
                frequency: frequency
            });
            // 更新截止日期
            db.run('UPDATE recurring_patterns SET end_date=?, repeat_end_date=? WHERE id=?',
                [genEndDate, genEndDate, patternId]);
            debouncedSave();

            // 生成课程
            const generated = PatternDB.generateCourses(patternId, date, genEndDate);
            loadCourses();
            showToast(`循环课程已创建，共${generated.length}节课`);
        } else {
            // 单次课程
            const result = CourseDB.create({
                student_id: studentId,
                course_date: date,
                start_time: startTime,
                end_time: endTime
            });
            if (result && result.id) {
                try {
                    db.run(`UPDATE courses SET note=?, feedback=?, course_type=? WHERE id=?`,
                        [note, feedback, courseType, result.id]);
                    debouncedSave();
                } catch(e) {}
            }
            showToast(`已保存，课时费 ¥${result.fee.toFixed(0)}`);
        }

        // 重置表单
        document.getElementById('ac-note').value = '';
        document.getElementById('ac-feedback').value = '';
        document.getElementById('ac-date').value = todayStr();
        if (document.getElementById('ac-recurring')) document.getElementById('ac-recurring').checked = false;
        if (document.getElementById('ac-recurring-fields')) document.getElementById('ac-recurring-fields').style.display = 'none';
    } catch (e) { showToast(e.message); }
}

// ==================== 编辑课程 ====================
function editCourse(id) {
    removeCoursePopup();
    const course = CourseDB.getById(id);
    if (!course) return;
    const studentOptions = students.map(s =>
        `<option value="${s.id}" ${s.id === course.student_id ? 'selected' : ''}>${s.name} (${s.institution_name || ''})</option>`
    ).join('');
    openModal('编辑课程', `
        <div class="form-group"><label>学生</label><select id="edit-student">${studentOptions}</select></div>
        <div class="form-group"><label>日期</label><input type="date" id="edit-date" value="${course.course_date}"></div>
        <div class="form-group"><label>时间</label>
            <div class="time-row">
                <input type="time" id="edit-start" value="${course.start_time}" onchange="autoSetEndTime('edit-start','edit-end')">
                <span>至</span>
                <input type="time" id="edit-end" value="${course.end_time}">
            </div>
        </div>
        <div class="form-actions">
            <button class="btn outline" onclick="closeModal()">取消</button>
            <button class="btn primary" onclick="updateCourse(${id})">保存</button>
        </div>
    `);
}

function updateCourse(id) {
    try {
        const courseDate = document.getElementById('edit-date').value;
        const startTime = document.getElementById('edit-start').value;
        const endTime = document.getElementById('edit-end').value;
        const conflicts = ConflictDB.checkOverlap(courseDate, startTime, endTime, id);
        if (conflicts.length > 0) {
            const conflictInfo = conflicts.map(c => `${c.student_name} ${c.start_time}-${c.end_time}`).join('\\n');
            if (!confirm(`时间冲突！\\n${conflictInfo}\\n是否继续？`)) return;
        }
        CourseDB.update(id, {
            student_id: parseInt(document.getElementById('edit-student').value),
            course_date: courseDate, start_time: startTime, end_time: endTime
        });
        closeModal();
        loadCourses();
        showToast('已更新');
    } catch (e) { showToast(e.message); }
}

// ==================== 删除课程 ====================
function confirmDeleteCourse(id) {
    removeCoursePopup();
    openModal('确认删除', `
        <div class="confirm-dialog">
            <p>确定要删除这节课吗？</p>
            <div class="actions">
                <button class="btn outline" onclick="closeModal()">取消</button>
                <button class="btn danger" onclick="deleteCourse(${id})">删除</button>
            </div>
        </div>
    `);
}

function deleteCourse(id) {
    CourseDB.delete(id);
    closeModal();
    loadCourses();
    showToast('已删除');
}

// ==================== 统计页 ====================
function switchStatsRange(range) {
    currentStatsRange = range;
    document.querySelectorAll('.stats-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`.stats-tab[data-range="${range}"]`).classList.add('active');
    document.getElementById('stats-custom-range').style.display = range === 'custom' ? 'flex' : 'none';
    refreshStats();
}

function switchStatsView(view) {
    currentStatsView = view;
    document.querySelectorAll('.stats-sub-tab').forEach(t => t.classList.remove('active'));
    if (event && event.target) event.target.classList.add('active');
    document.getElementById('stats-overview').style.display = view === 'overview' ? '' : 'none';
    document.getElementById('stats-student').style.display = view === 'student' ? '' : 'none';
    document.getElementById('stats-income').style.display = view === 'income' ? '' : 'none';
    refreshStats();
}

function getStatsDateRange() {
    const now = new Date();
    let start, end, label;
    if (currentStatsRange === 'month') {
        start = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
        end = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-31`;
        label = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    } else if (currentStatsRange === 'week') {
        const ws = new Date(now);
        ws.setDate(now.getDate() - (now.getDay() === 0 ? 6 : now.getDay() - 1));
        const we = new Date(ws); we.setDate(ws.getDate() + 6);
        start = formatDate(ws); end = formatDate(we);
        label = `${formatDateCN(ws)} - ${formatDateCN(we)}`;
    } else if (currentStatsRange === 'year') {
        start = `${now.getFullYear()}-01-01`; end = `${now.getFullYear()}-12-31`;
        label = `${now.getFullYear()}年`;
    } else {
        start = document.getElementById('stats-custom-start')?.value || formatDate(new Date(now.getFullYear(), now.getMonth(), 1));
        end = document.getElementById('stats-custom-end')?.value || formatDate(now);
        label = `${start} 至 ${end}`;
    }
    return { start, end, label };
}

function refreshStats() {
    const { start, end, label } = getStatsDateRange();
    const coursesList = CourseDB.getByDateRange(start, end);
    document.getElementById('stats-period-label').textContent = label;
    if (currentStatsView === 'overview') renderStatsOverview(coursesList, label, start, end);
    else if (currentStatsView === 'student') renderStatsStudent(coursesList);
    else if (currentStatsView === 'income') renderStatsIncome(coursesList, start, end);
}

function renderStatsOverview(coursesList, label) {
    document.getElementById('stats-summary-period').textContent = label;
    let totalIncome = 0, totalHours = 0;
    const activeDays = new Set();
    for (const c of coursesList) { totalIncome += c.fee; totalHours += c.duration_hours; activeDays.add(c.course_date); }
    const dayCount = activeDays.size || 1;
    document.getElementById('stats-total-income').textContent = `¥${totalIncome.toFixed(0)}`;
    document.getElementById('stats-s1').textContent = coursesList.length;
    document.getElementById('stats-s2').textContent = `${totalHours.toFixed(1)}小时`;
    document.getElementById('stats-s3').textContent = `${activeDays.size}天`;
    document.getElementById('stats-s4').textContent = `¥${(totalIncome / dayCount).toFixed(0)}`;
    const count1v1 = coursesList.filter(c => (c.course_type || '1v1') === '1v1').length;
    const countClass = coursesList.length - count1v1;
    const pct1v1 = coursesList.length > 0 ? (count1v1 / coursesList.length * 100) : 0;
    const pctClass = 100 - pct1v1;
    document.getElementById('stats-class-total').textContent = `${coursesList.length}节`;
    document.getElementById('bar-1v1').style.width = `${pct1v1}%`;
    document.getElementById('bar-class').style.width = `${pctClass}%`;
    document.getElementById('stats-1v1-count').textContent = `${count1v1}节·${pct1v1.toFixed(0)}%`;
    document.getElementById('stats-class-count').textContent = `${countClass}节·${pctClass.toFixed(0)}%`;
    const byStudent = {};
    for (const c of coursesList) { if (!byStudent[c.student_id]) byStudent[c.student_id] = { name: c.student_name, total: 0 }; byStudent[c.student_id].total += c.fee; }
    const topStudents = Object.values(byStudent).sort((a,b) => b.total - a.total).slice(0, 4);
    document.getElementById('stats-by-student').innerHTML = topStudents.length === 0 ? '<div style="font-size:12px;color:var(--text-secondary)">暂无数据</div>' : topStudents.map(s => `<div class="stats-source-item"><span>${s.name}</span><span>¥${s.total.toFixed(0)}</span></div>`).join('');
    const byInst = {};
    for (const c of coursesList) { const key = c.institution_id || 0; if (!byInst[key]) byInst[key] = { name: c.institution_name || '未知', total: 0 }; byInst[key].total += c.fee; }
    const topInsts = Object.values(byInst).sort((a,b) => b.total - a.total).slice(0, 4);
    document.getElementById('stats-by-inst').innerHTML = topInsts.length === 0 ? '<div style="font-size:12px;color:var(--text-secondary)">暂无数据</div>' : topInsts.map(s => `<div class="stats-source-item"><span>${s.name}</span><span>¥${s.total.toFixed(0)}</span></div>`).join('');

    // 本周快报（独立获取本周数据，不受时间筛选影响）
    renderWeeklyReport();
}

function renderWeeklyReport(coursesList, periodLabel) {
    if (!coursesList) {
        // 默认取当前周
        const now = new Date();
        const dow = now.getDay();
        const ws = new Date(now); ws.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1));
        const we = new Date(ws); we.setDate(ws.getDate() + 6);
        coursesList = CourseDB.getByDateRange(formatDate(ws), formatDate(we));
        periodLabel = `${formatDate(ws)} ~ ${formatDate(we)}`;
    }
    const weekIncome = coursesList.reduce((s, c) => s + c.fee, 0);
    const weekCount = coursesList.length;

    const dayNames = ['周一','周二','周三','周四','周五','周六','周日'];
    const byDay = {};
    for (let i = 0; i < 7; i++) byDay[i] = { income: 0, count: 0 };
    for (const c of coursesList) {
        const d = new Date(c.course_date + 'T00:00:00');
        const dayIdx = d.getDay() === 0 ? 6 : d.getDay() - 1;
        byDay[dayIdx].income += c.fee;
        byDay[dayIdx].count++;
    }
    let peakDay = 0, peakIncome = 0;
    for (let i = 0; i < 7; i++) {
        if (byDay[i].income > peakIncome) { peakIncome = byDay[i].income; peakDay = i; }
    }

    const container = document.getElementById('stats-weekly-content');
    if (!container) return;
    container.innerHTML = `
        <div style="font-size:12px;color:var(--text-secondary);margin-bottom:12px">${periodLabel || ''}</div>
        <div style="display:flex;justify-content:space-around;text-align:center">
            <div><div style="font-size:18px;font-weight:700;color:var(--primary)">¥${weekIncome.toFixed(0)}</div><div style="font-size:11px;color:var(--text-secondary)">总收入</div></div>
            <div><div style="font-size:18px;font-weight:700">${weekCount}</div><div style="font-size:11px;color:var(--text-secondary)">总课时</div></div>
            <div><div style="font-size:18px;font-weight:700">${peakIncome > 0 ? dayNames[peakDay] : '-'}</div><div style="font-size:11px;color:var(--text-secondary)">峰值日 ${peakIncome > 0 ? '¥'+peakIncome.toFixed(0) : ''}</div></div>
        </div>
    `;
}

function renderStatsStudent(coursesList) {
    const byStudent = {};
    for (const c of coursesList) {
        if (!byStudent[c.student_id]) byStudent[c.student_id] = { name: c.student_name, inst: c.institution_name || '未知', color: getStudentColor(c.student_id), totalFee: 0, totalHours: 0, count: 0, dates: new Set() };
        const s = byStudent[c.student_id]; s.totalFee += c.fee; s.totalHours += c.duration_hours; s.count++; s.dates.add(c.course_date);
    }
    const list = Object.values(byStudent).sort((a,b) => b.totalFee - a.totalFee);
    document.getElementById('stats-student-list').innerHTML = list.length === 0 ? '<div class="empty-tip">暂无数据</div>' : list.map(s => `<div class="stats-student-card"><div class="stats-student-header"><span class="stats-student-name" style="color:${s.color}">● ${s.name}</span><span class="stats-student-total">¥${s.totalFee.toFixed(0)}</span></div><div class="stats-student-detail"><span>${s.count}节课</span><span>${s.totalHours.toFixed(1)}小时</span><span>${s.dates.size}天</span><span>${s.inst}</span></div></div>`).join('');
}

function renderStatsIncome(coursesList) {
    const weeklyData = {};
    for (const c of coursesList) {
        const d = new Date(c.course_date + 'T00:00:00');
        const ws = new Date(d); const dow = d.getDay(); ws.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
        const key = formatDate(ws);
        if (!weeklyData[key]) weeklyData[key] = { income: 0, count: 0 };
        weeklyData[key].income += c.fee; weeklyData[key].count++;
    }
    const weeks = Object.entries(weeklyData).sort((a,b) => a[0].localeCompare(b[0]));
    const maxIncome = Math.max(...weeks.map(w => w[1].income), 1);
    let html = '<div class="stats-section"><h3>收入趋势</h3>';
    if (weeks.length === 0) { html += '<div style="font-size:12px;color:var(--text-secondary)">暂无数据</div>'; }
    else { for (const [week, data] of weeks) { const pct = (data.income / maxIncome * 100).toFixed(0); html += `<div style="margin-bottom:8px"><div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:2px"><span>${week}</span><span>¥${data.income.toFixed(0)} (${data.count}节)</span></div><div class="stats-bar"><div class="stats-bar-fill" style="width:${pct}%"></div></div></div>`; } }
    html += '</div>';
    document.getElementById('stats-income-content').innerHTML = html;
}

// ==================== 历史记录 ====================
function openHistoryPage() {
    const now = new Date();
    const ms = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
    const me = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-31`;
    document.getElementById('history-start').value = ms;
    document.getElementById('history-end').value = me;
    document.getElementById('history-inst').innerHTML = '<option value="all">全部</option>' + institutions.map(i => `<option value="${i.id}">${i.name}</option>`).join('');
    openSubPage('history'); refreshHistory();
}

function refreshHistory() {
    const start = document.getElementById('history-start').value;
    const end = document.getElementById('history-end').value;
    const instFilter = document.getElementById('history-inst').value;
    let cl = CourseDB.getByDateRange(start, end);
    if (instFilter !== 'all') cl = cl.filter(c => String(c.institution_id) === instFilter);
    const container = document.getElementById('history-list');
    if (cl.length === 0) { container.innerHTML = '<div class="history-empty">暂无记录</div>'; return; }
    if (currentHistoryView === 'list') {
        container.innerHTML = cl.map(c => `<div class="history-item"><div class="history-dot" style="background:${getStudentColor(c.student_id)}"></div><div class="history-info"><div class="history-name">${c.student_name}</div><div class="history-sub">${c.course_date} ${c.start_time}-${c.end_time} · ${c.institution_name || ''}</div></div><div class="history-fee">¥${c.fee.toFixed(0)}</div></div>`).join('');
    } else {
        const grouped = {};
        for (const c of cl) { const d = new Date(c.course_date + 'T00:00:00'); const ws = new Date(d); const dow = d.getDay(); ws.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1)); const key = formatDate(ws); if (!grouped[key]) grouped[key] = []; grouped[key].push(c); }
        let html = '';
        for (const [weekStart, weekCourses] of Object.entries(grouped).sort((a,b) => b[0].localeCompare(a[0]))) {
            const we = new Date(new Date(weekStart + 'T00:00:00').getTime() + 6*86400000);
            const total = weekCourses.reduce((s,c) => s + c.fee, 0);
            html += `<div style="padding:8px 16px;font-size:13px;color:var(--text-secondary);font-weight:600">${formatDateCN(new Date(weekStart+'T00:00:00'))} - ${formatDateCN(we)} · ¥${total.toFixed(0)}</div>`;
            html += weekCourses.map(c => `<div class="history-item"><div class="history-dot" style="background:${getStudentColor(c.student_id)}"></div><div class="history-info"><div class="history-name">${c.student_name}</div><div class="history-sub">${c.course_date} ${c.start_time}-${c.end_time}</div></div><div class="history-fee">¥${c.fee.toFixed(0)}</div></div>`).join('');
        }
        container.innerHTML = html;
    }
}

function switchHistoryView(view) {
    currentHistoryView = view;
    document.querySelectorAll('.history-view-tab').forEach(t => t.classList.remove('active'));
    if (event && event.target) event.target.classList.add('active');
    refreshHistory();
}

function exportHistory() {
    const start = document.getElementById('history-start').value;
    const end = document.getElementById('history-end').value;
    const wb = ExportDB.toExcel(start, end);
    XLSX.writeFile(wb, `课时费_${start}_${end}.xlsx`);
    showToast('Excel已导出');
}

// ==================== 机构管理 ====================
function openInstitutionManage() {
    institutions = InstitutionDB.getAll();
    const ac = institutions.filter(i => (i.status || 'active') === 'active').length;
    const dc = institutions.filter(i => i.status === 'disabled').length;
    document.getElementById('inst-active-count').textContent = `${ac} 活跃`;
    document.getElementById('inst-disabled-count').textContent = `${dc} 禁用`;
    document.getElementById('inst-all-count').textContent = `${institutions.length} 全部`;
    document.getElementById('inst-manage-list').innerHTML = institutions.map(i => {
        const st = i.status || 'active';
        const stCls = st === 'active' ? 'active' : 'disabled';
        const stTxt = st === 'active' ? '启用' : '禁用';
        return `<div class="inst-card"><div class="inst-card-header"><div class="color-dot" style="background:${i.color}"></div><span class="inst-card-name">${i.name}</span><span class="inst-tag monthly">月结</span>${i.is_default ? '<span class="inst-tag default">默认</span>' : ''}<span class="inst-tag ${stCls}">${stTxt}</span></div><div class="inst-card-actions"><button class="btn-sm" onclick="editInstitution(${i.id})">编辑</button><button class="btn-sm" style="background:var(--text-secondary)" onclick="toggleInstStatus(${i.id})">${st === 'active' ? '禁用' : '启用'}</button>${!i.is_default ? `<button class="btn-sm" style="background:var(--warning)" onclick="setDefaultInst(${i.id})">设为默认</button>` : ''}</div></div>`;
    }).join('');
    openSubPage('inst-manage');
}

function toggleInstStatus(id) {
    const inst = InstitutionDB.getById(id); if (!inst) return;
    const ns = (inst.status || 'active') === 'active' ? 'disabled' : 'active';
    InstitutionDB.update(id, { ...inst, status: ns });
    institutions = InstitutionDB.getAll(); openInstitutionManage();
    showToast(ns === 'active' ? '已启用' : '已禁用');
}

function setDefaultInst(id) {
    for (const inst of institutions) { if (inst.is_default) InstitutionDB.update(inst.id, { ...inst, is_default: 0 }); }
    const inst = InstitutionDB.getById(id); InstitutionDB.update(id, { ...inst, is_default: 1 });
    institutions = InstitutionDB.getAll(); openInstitutionManage(); showToast('已设为默认');
}

function openInstitutionForm(editId) {
    const inst = editId ? InstitutionDB.getById(editId) : null;
    const title = inst ? '编辑机构' : '添加机构';
    const colorOptions = COLORS.map(c => `<div class="color-option ${(inst && inst.color === c) || (!inst && c === COLORS[0]) ? 'selected' : ''}" style="background:${c}" data-color="${c}" onclick="selectColor(this)"></div>`).join('');
    openModal(title, `<div class="form-group"><label>机构名称</label><input type="text" id="inst-name" value="${inst ? inst.name : ''}" placeholder="输入机构名称"></div><div class="form-group"><label>颜色标识</label><div class="color-options" id="inst-colors">${colorOptions}</div></div><div class="form-group"><label>每月发薪日（0=不定期）</label><input type="number" id="inst-payday" value="${inst ? inst.pay_day : 0}" min="0" max="31"></div><div class="form-actions"><button class="btn outline" onclick="closeModal()">取消</button><button class="btn primary" onclick="saveInstitution(${editId || 0})">${inst ? '保存' : '添加'}</button></div>`);
}

function editInstitution(id) { openInstitutionForm(id); }
function selectColor(el) { el.parentElement.querySelectorAll('.color-option').forEach(c => c.classList.remove('selected')); el.classList.add('selected'); }

function saveInstitution(editId) {
    try {
        const name = document.getElementById('inst-name').value.trim(); if (!name) throw new Error('请输入机构名称');
        const colorEl = document.querySelector('#inst-colors .color-option.selected');
        const color = colorEl ? colorEl.dataset.color : COLORS[0];
        const payDay = parseInt(document.getElementById('inst-payday').value) || 0;
        if (editId) InstitutionDB.update(editId, { name, color, pay_day: payDay });
        else InstitutionDB.create({ name, color, pay_day: payDay });
        closeModal(); students = StudentDB.getAll(); buildStudentColorMap(); institutions = InstitutionDB.getAll();
        openInstitutionManage(); showToast(editId ? '已更新' : '已添加');
    } catch (e) { showToast(e.message); }
}

function deleteInst(id) { try { InstitutionDB.delete(id); closeModal(); institutions = InstitutionDB.getAll(); openInstitutionManage(); showToast('已删除'); } catch (e) { showToast(e.message); } }

// ==================== 学生档案 ====================
function openStudentArchives() {
    students = StudentDB.getAll();
    document.getElementById('archives-count').textContent = `${students.length}人`;
    document.getElementById('archives-inst').innerHTML = '<option value="all">全部</option>' + institutions.map(i => `<option value="${i.id}">${i.name}</option>`).join('');
    openSubPage('student-archives'); renderStudentArchives(students);
}

function renderStudentArchives(list) {
    const container = document.getElementById('archives-list');
    if (list.length === 0) { container.innerHTML = '<div class="history-empty">还没有学生档案<br><small>先去记一笔课程，学生会自动沉淀到这里</small></div>'; return; }
    container.innerHTML = list.map(s => {
        const sc = CourseDB.getByStudent(s.id);
        const tf = sc.reduce((sum, c) => sum + c.fee, 0);
        const th = sc.reduce((sum, c) => sum + c.duration_hours, 0);
        const last = sc.length > 0 ? sc[sc.length - 1] : null;
        return `<div class="archive-card" onclick="openStudentDetail(${s.id})"><div class="archive-avatar" style="background:${getStudentColor(s.id)}">${s.name.charAt(0)}</div><div class="archive-info"><div class="archive-name">${s.name}</div><div class="archive-sub">${s.institution_name || '未知'} · ${s.grade || '未设置'} · ${last ? '最近: ' + last.course_date : '暂无课程'}</div></div><div class="archive-stats"><div class="archive-stats-value">¥${tf.toFixed(0)}</div><div class="archive-stats-label">${th.toFixed(1)}小时 · ${sc.length}节</div></div></div>`;
    }).join('');
}

function searchStudents() {
    const kw = document.getElementById('archives-search-input').value.trim();
    let f = students; if (kw) f = f.filter(s => s.name.includes(kw));
    const instF = document.getElementById('archives-inst').value;
    if (instF !== 'all') f = f.filter(s => String(s.institution_id) === instF);
    renderStudentArchives(f);
}
function filterStudentArchives() { searchStudents(); }

// ==================== 学生详情（课程历史） ====================
let _currentDetailStudentId = 0;
function openStudentDetail(stuId) {
    _currentDetailStudentId = stuId;
    const stu = StudentDB.getById(stuId);
    if (!stu) return;
    const allCourses = CourseDB.getByStudent(stuId);
    const totalFee = allCourses.reduce((s, c) => s + c.fee, 0);
    const totalHours = allCourses.reduce((s, c) => s + c.duration_hours, 0);
    const activeDays = new Set(allCourses.map(c => c.course_date)).size;
    const lastCourse = allCourses.length > 0 ? allCourses[allCourses.length - 1] : null;

    // 设置默认日期范围：最近3个月
    const now = new Date();
    const defaultStart = formatDate(new Date(now.getTime() - 90 * 86400000));
    const defaultEnd = formatDate(now);

    let html = `
        <div style="padding:16px;background:linear-gradient(135deg,var(--primary),#6366F1);color:#fff;border-radius:var(--radius);margin-bottom:16px">
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
                <div style="width:48px;height:48px;border-radius:50%;background:rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700">${stu.name.charAt(0)}</div>
                <div>
                    <div style="font-size:18px;font-weight:700">${stu.name}</div>
                    <div style="font-size:13px;opacity:0.8">${stu.institution_name || '未知机构'} · ${stu.grade || '未设置年级'}</div>
                </div>
                <button class="btn-sm" style="margin-left:auto;background:rgba(255,255,255,0.2)" onclick="closeModal();editStudent(${stuId})">编辑</button>
            </div>
            <div style="display:flex;justify-content:space-around;text-align:center">
                <div><div style="font-size:20px;font-weight:700">${allCourses.length}</div><div style="font-size:11px;opacity:0.8">总课时</div></div>
                <div><div style="font-size:20px;font-weight:700">${totalHours.toFixed(1)}h</div><div style="font-size:11px;opacity:0.8">总时长</div></div>
                <div><div style="font-size:20px;font-weight:700">¥${totalFee.toFixed(0)}</div><div style="font-size:11px;opacity:0.8">总收入</div></div>
                <div><div style="font-size:20px;font-weight:700">${activeDays}</div><div style="font-size:11px;opacity:0.8">活跃天数</div></div>
            </div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px">
            <input type="date" id="detail-start" value="${defaultStart}" style="flex:1;padding:6px;border:1px solid var(--border);border-radius:6px;font-size:13px">
            <span style="color:var(--text-secondary)">至</span>
            <input type="date" id="detail-end" value="${defaultEnd}" style="flex:1;padding:6px;border:1px solid var(--border);border-radius:6px;font-size:13px">
            <button class="btn-sm" onclick="refreshStudentDetail(${stuId})">查询</button>
        </div>
        <div id="student-detail-courses">
    `;

    const filtered = allCourses.filter(c => c.course_date >= defaultStart && c.course_date <= defaultEnd);
    if (filtered.length === 0) {
        html += '<div class="empty-tip" style="padding:20px">该时段无课程记录</div>';
    } else {
        html += filtered.slice().reverse().map(c => `
            <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)">
                <div style="width:6px;height:36px;border-radius:3px;background:${getStudentColor(stuId)};flex-shrink:0"></div>
                <div style="flex:1">
                    <div style="font-size:14px;font-weight:500">${c.course_date}</div>
                    <div style="font-size:12px;color:var(--text-secondary)">${c.start_time}-${c.end_time} · ${c.duration_hours.toFixed(1)}小时</div>
                </div>
                <div style="font-weight:700;color:var(--primary)">¥${c.fee.toFixed(0)}</div>
            </div>
        `).join('');
    }
    html += '</div>';
    openModal(stu.name + ' - 课程记录', html);
}

function refreshStudentDetail(stuId) {
    const start = document.getElementById('detail-start').value;
    const end = document.getElementById('detail-end').value;
    const allCourses = CourseDB.getByStudent(stuId);
    const filtered = allCourses.filter(c => c.course_date >= start && c.course_date <= end);
    const container = document.getElementById('student-detail-courses');
    if (filtered.length === 0) {
        container.innerHTML = '<div class="empty-tip" style="padding:20px">该时段无课程记录</div>';
    } else {
        container.innerHTML = filtered.slice().reverse().map(c => `
            <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)">
                <div style="width:6px;height:36px;border-radius:3px;background:${getStudentColor(stuId)};flex-shrink:0"></div>
                <div style="flex:1">
                    <div style="font-size:14px;font-weight:500">${c.course_date}</div>
                    <div style="font-size:12px;color:var(--text-secondary)">${c.start_time}-${c.end_time} · ${c.duration_hours.toFixed(1)}小时</div>
                </div>
                <div style="font-weight:700;color:var(--primary)">¥${c.fee.toFixed(0)}</div>
            </div>
        `).join('');
    }
}

function sortStudentArchives(sortBy) {
    document.querySelectorAll('.archives-sort-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`.archives-sort-btn[data-sort="${sortBy}"]`).classList.add('active');
    let sorted = [...students];
    if (sortBy === 'name') sorted.sort((a,b) => a.name.localeCompare(b.name));
    else if (sortBy === 'income') sorted.sort((a,b) => { const af = CourseDB.getByStudent(a.id).reduce((s,c) => s + c.fee, 0); const bf = CourseDB.getByStudent(b.id).reduce((s,c) => s + c.fee, 0); return bf - af; });
    else if (sortBy === 'hours') sorted.sort((a,b) => { const ah = CourseDB.getByStudent(a.id).reduce((s,c) => s + c.duration_hours, 0); const bh = CourseDB.getByStudent(b.id).reduce((s,c) => s + c.duration_hours, 0); return bh - ah; });
    else if (sortBy === 'recent') sorted.sort((a,b) => { const ac = CourseDB.getByStudent(a.id); const bc = CourseDB.getByStudent(b.id); return (bc.length > 0 ? bc[bc.length-1].course_date : '').localeCompare(ac.length > 0 ? ac[ac.length-1].course_date : ''); });
    renderStudentArchives(sorted);
}

// ==================== 学生表单 ====================
function openStudentForm(editId) {
    const stu = editId ? StudentDB.getById(editId) : null;
    const title = stu ? '编辑学生' : '添加学生';
    const instOpts = institutions.map(i => `<option value="${i.id}" ${stu && stu.institution_id === i.id ? 'selected' : ''}>${i.name}</option>`).join('');
    const rt = stu ? stu.rate_type : 'hourly';
    const st = stu ? (stu.student_type || '1v1') : '1v1';
    const defaultGradeRate = stu && stu.grade ? getGradeRate(stu.institution_id, stu.grade) : 0;
    const hr = stu ? stu.hourly_rate : (defaultGradeRate > 0 ? defaultGradeRate : 150);
    const fr = stu ? (stu.fixed_rate || '') : '';
    openModal(title, `<div class="form-group"><label>学生姓名</label><input type="text" id="stu-name" value="${stu ? stu.name : ''}" placeholder="输入学生姓名"></div><div class="form-group"><label>学生类型</label><select id="stu-type"><option value="1v1" ${st==='1v1'?'selected':''}>一对一</option><option value="class" ${st==='class'?'selected':''}>班课</option></select></div><div class="form-group"><label>所属机构</label><select id="stu-inst">${instOpts}</select></div><div class="form-group"><label>年级</label><select id="stu-grade" onchange="autoFillGradeRate()"><option value="">未设置</option>${GRADE_NAMES.map(g => '<option value="' + g + '" ' + (stu && stu.grade === g ? 'selected' : '') + '>' + g + '</option>').join('')}</select></div><div class="form-group"><label>计费方式</label><select id="stu-rate-type" onchange="toggleRateFields()"><option value="hourly" ${rt==='hourly'?'selected':''}>按小时</option><option value="fixed" ${rt==='fixed'?'selected':''}>固定费用</option></select></div><div class="form-group" id="hourly-field" style="${rt==='fixed'?'display:none':''}"><label>每小时费用（元）</label><input type="number" id="stu-hourly" value="${hr}" min="0"></div><div class="form-group" id="fixed-field" style="${rt==='hourly'?'display:none':''}"><label>每节课固定费用（元）</label><input type="number" id="stu-fixed" value="${fr}" min="0"></div><h4 style="margin:16px 0 8px">循环课程时间</h4><div id="student-slots" class="slot-list"></div><button class="btn outline" style="margin-bottom:12px" onclick="addStudentSlot()">＋ 添加时间段</button><div class="form-group"><label>开始上课日期</label><input type="date" id="stu-start-date" value="${stu ? (stu._startDate || '') : ''}"></div><h4 style="margin:16px 0 8px">循环范围</h4><div class="form-group"><label>循环方式</label><select id="repeat-mode" onchange="toggleRepeatMode()"><option value="weeks">按周数</option><option value="enddate">按截止日期</option><option value="unlimited">不限制</option></select></div><div class="form-group" id="repeat-weeks-field"><label>循环周数</label><div style="display:flex;gap:8px;align-items:center"><input type="number" id="repeat-weeks" value="8" min="1" max="104" style="width:80px"><span>周</span></div></div><div class="form-group" id="repeat-enddate-field" style="display:none"><label>截止日期</label><input type="date" id="repeat-end-date"></div><div class="form-actions"><button class="btn outline" onclick="closeModal()">取消</button><button class="btn primary" onclick="saveStudent(${editId || 0})">${stu ? '保存' : '添加'}</button></div>`);
    if (stu) {
        const patterns = PatternDB.getByStudent(stu.id);
        window._studentSlots = patterns.map(p => ({ day_of_week: p.day_of_week, start_time: p.start_time, end_time: p.end_time, frequency: p.frequency || 'weekly', pattern_id: p.id }));
        if (patterns.length > 0) { const p = patterns[0]; if (p.start_date) document.getElementById('stu-start-date').value = p.start_date; setTimeout(() => { const rw = p.repeat_weeks || 0; const red = p.repeat_end_date || ''; if (rw > 0) { document.getElementById('repeat-mode').value = 'weeks'; document.getElementById('repeat-weeks').value = rw; } else if (red) { document.getElementById('repeat-mode').value = 'enddate'; document.getElementById('repeat-end-date').value = red; } else { document.getElementById('repeat-mode').value = 'unlimited'; } toggleRepeatMode(); }, 50); }
    } else { window._studentSlots = [{ day_of_week: 1, start_time: '09:00', end_time: '11:00', frequency: 'weekly' }]; }
    renderStudentSlots();
}

function toggleRateFields() { const t = document.getElementById('stu-rate-type').value; document.getElementById('hourly-field').style.display = t === 'fixed' ? 'none' : ''; document.getElementById('fixed-field').style.display = t === 'hourly' ? 'none' : ''; }
function autoFillGradeRate() {
    const grade = document.getElementById('stu-grade')?.value;
    const instId = parseInt(document.getElementById('stu-inst')?.value) || 0;
    if (grade) {
        const rate = getGradeRate(instId, grade);
        if (rate > 0) {
            const hourlyEl = document.getElementById('stu-hourly');
            if (hourlyEl) hourlyEl.value = rate;
        }
    }
}
function toggleRepeatMode() { const m = document.getElementById('repeat-mode').value; document.getElementById('repeat-weeks-field').style.display = m === 'weeks' ? '' : 'none'; document.getElementById('repeat-enddate-field').style.display = m === 'enddate' ? '' : 'none'; }
function addStudentSlot() { window._studentSlots.push({ day_of_week: 1, start_time: '09:00', end_time: '11:00', frequency: 'weekly' }); renderStudentSlots(); }
function removeStudentSlot(idx) { window._studentSlots.splice(idx, 1); renderStudentSlots(); }

function renderStudentSlots() {
    const c = document.getElementById('student-slots');
    if (!window._studentSlots || window._studentSlots.length === 0) { c.innerHTML = '<div style="font-size:12px;color:var(--text-secondary)">暂无固定时间段</div>'; return; }
    c.innerHTML = window._studentSlots.map((s, i) => `<div class="slot-item"><select onchange="window._studentSlots[${i}].day_of_week=parseInt(this.value)" style="border:1px solid var(--border);border-radius:4px;padding:4px">${[1,2,3,4,5,6,7].map(d => '<option value="' + d + '" ' + (d===s.day_of_week?'selected':'') + '>' + DAY_NAMES[d] + '</option>').join('')}</select><input type="time" value="${s.start_time}" onchange="window._studentSlots[${i}].start_time=this.value;window._studentSlots[${i}].end_time=addHoursToTime(this.value,2);renderStudentSlots()" style="border:1px solid var(--border);border-radius:4px;padding:4px;width:90px"><span>-</span><input type="time" value="${s.end_time}" onchange="window._studentSlots[${i}].end_time=this.value" style="border:1px solid var(--border);border-radius:4px;padding:4px;width:90px"><select onchange="window._studentSlots[${i}].frequency=this.value" style="border:1px solid var(--border);border-radius:4px;padding:4px"><option value="weekly" ${s.frequency==='weekly'?'selected':''}>每周</option><option value="biweekly" ${s.frequency==='biweekly'?'selected':''}>隔周</option></select><span class="remove-slot" onclick="removeStudentSlot(${i})">✕</span></div>`).join('');
}

async function saveStudent(editId) {
    try {
        const name = document.getElementById('stu-name').value.trim(); if (!name) { showToast('请输入学生姓名'); return; }
        const instId = parseInt(document.getElementById('stu-inst').value);
        const rateType = document.getElementById('stu-rate-type').value;
        const hourlyRate = parseFloat(document.getElementById('stu-hourly').value) || 150;
        const fixedRate = parseFloat(document.getElementById('stu-fixed').value) || null;
        const grade = document.getElementById('stu-grade')?.value || '';
        const studentType = document.getElementById('stu-type')?.value || '1v1';
        const slots = window._studentSlots || []; const hasSlots = slots.length > 0;
        let studentId = editId;
        try {
            if (editId) { StudentDB.update(editId, { name, institution_id: instId, hourly_rate: hourlyRate, rate_type: rateType, fixed_rate: fixedRate, student_type: studentType }); window._oldPatternIds = PatternDB.getByStudent(editId).map(p => p.id); }
            else { studentId = StudentDB.create({ name, institution_id: instId, hourly_rate: hourlyRate, rate_type: rateType, fixed_rate: fixedRate, student_type: studentType }); window._oldPatternIds = []; }
            if (studentId) { try { db.run('UPDATE students SET grade=? WHERE id=?', [grade, studentId]); debouncedSave(); } catch(e) {} }
        } catch (e) { showToast('保存失败: ' + e.message); return; }
        if (!hasSlots) { if (window._oldPatternIds) for (const oid of window._oldPatternIds) PatternDB.delete(oid); window._oldPatternIds = null; await saveToIndexedDB(); closeModal(); await loadAllData();
            // 如果学生档案页面打开，刷新列表
            if (document.getElementById('page-student-archives')?.classList.contains('active')) {
                students = StudentDB.getAll();
                document.getElementById('archives-count').textContent = `${students.length}人`;
                renderStudentArchives(students);
            }
            showToast((editId ? '已更新' : '已添加') + '（试听模式）'); return; }
        const rm = document.getElementById('repeat-mode').value;
        const rw = rm === 'weeks' ? (parseInt(document.getElementById('repeat-weeks').value) || 8) : 0;
        const red = rm === 'enddate' ? document.getElementById('repeat-end-date').value : '';
        const usd = document.getElementById('stu-start-date').value;
        let startDate = usd || (() => { const t = new Date(); const d = t.getDay(); const m = new Date(t); m.setDate(t.getDate() - d + (d === 0 ? -6 : 1)); return formatDate(m); })();
        let ged;
        if (rm === 'weeks' && rw > 0) ged = formatDate(new Date(new Date(startDate + 'T00:00:00').getTime() + rw * 7 * 86400000));
        else if (rm === 'enddate' && red) ged = red;
        else ged = formatDate(new Date(Date.now() + 180*86400000));
        let pc = 0;
        for (const slot of slots) { try { db.run('INSERT INTO recurring_patterns (student_id, day_of_week, start_time, end_time, start_date, end_date, is_active, frequency, repeat_weeks, repeat_end_date) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)', [studentId, slot.day_of_week, slot.start_time, slot.end_time, startDate, ged, slot.frequency || 'weekly', rw, red]); pc++; } catch (e) { showToast('保存失败: ' + e.message); return; } }
        try { await saveToIndexedDB(); } catch(e) {}
        if (window._oldPatternIds) { for (const oid of window._oldPatternIds) PatternDB.delete(oid); await saveToIndexedDB(); }
        window._oldPatternIds = null;
        let gc = 0;
        try { const sp = PatternDB.getByStudent(studentId); for (const p of sp) { const r = PatternDB.generateCourses(p.id, startDate, ged); gc += r.length; } } catch(e) {}
        closeModal(); await loadAllData();
        // 如果学生档案页面打开，刷新列表
        if (document.getElementById('page-student-archives')?.classList.contains('active')) {
            students = StudentDB.getAll();
            document.getElementById('archives-count').textContent = `${students.length}人`;
            renderStudentArchives(students);
        }
        showToast(editId ? `已更新，${pc}个时间段，${gc}节课` : `已添加，${pc}个时间段，${gc}节课`);
    } catch (e) { showToast('保存出错: ' + e.message); }
}

function editStudent(id) { openStudentForm(id); }
function toggleStatsSummary() {
    const card = document.querySelector('.stats-summary-card');
    const grid = card?.querySelector('.stats-summary-grid');
    const btn = document.getElementById('stats-collapse-btn');
    if (!grid || !btn) return;
    const hidden = grid.style.display === 'none';
    grid.style.display = hidden ? '' : 'none';
    btn.textContent = hidden ? '收起' : '展开';
}
function setIncomeGoal() {
    const now = new Date();
    const month = `${now.getFullYear()}年${now.getMonth()+1}月`;
    openModal('设置收入目标', `
        <div class="form-group"><label>${month} 收入目标（元）</label>
            <input type="number" id="income-goal-input" min="0" placeholder="输入目标金额">
        </div>
        <div class="form-actions">
            <button class="btn outline" onclick="closeModal()">取消</button>
            <button class="btn primary" onclick="closeModal();showToast('目标已设置')">确定</button>
        </div>
    `);
}

function deleteStudent(id) { StudentDB.delete(id); closeModal(); loadAllData(); openStudentArchives(); showToast('已删除'); }

// ==================== 课时费设置 ====================
function openFeeSettings() {
    let html = '<div class="fee-inst-card"><div class="fee-inst-header">📋 通用费率 <span style="font-size:12px;color:var(--text-secondary);font-weight:normal">（添加学生时自动填入）</span></div>';
    for (const g of GRADE_NAMES) {
        const rate = queryOne('SELECT hourly_rate FROM grade_rates WHERE institution_id=0 AND grade=?', [g]);
        const val = rate ? rate.hourly_rate : 0;
        html += `<div class="fee-grade-row"><span class="fee-grade-name">${g}</span><span class="fee-grade-value" onclick="editGradeRate(0,'${g}',${val})" style="cursor:pointer">${val > 0 ? '¥'+val+'/小时' : '未设置 ›'}</span></div>`;
    }
    html += '</div>';
    html += '<div style="text-align:center;margin-top:16px"><button class="btn-sm" style="background:var(--warning);font-size:13px;padding:8px 20px" onclick="batchSetGradeRate()">⚡ 统一设置所有年级</button></div>';
    document.getElementById('fee-settings-list').innerHTML = html;
    openSubPage('fee-settings');
}

function editGradeRate(instId, grade, currentVal) {
    openModal('设置课时费 - ' + grade, `
        <div class="form-group"><label>${grade} 每小时课时费（元）</label>
            <input type="number" id="grade-rate-input" value="${currentVal || ''}" min="0" placeholder="输入金额">
        </div>
        <div class="form-actions">
            <button class="btn outline" onclick="closeModal()">取消</button>
            <button class="btn primary" onclick="saveGradeRate(${instId},'${grade}')">保存</button>
        </div>
    `);
}

function saveGradeRate(instId, grade) {
    const rate = parseFloat(document.getElementById('grade-rate-input').value) || 0;
    if (rate <= 0) { showToast('请输入有效金额'); return; }
    const existing = queryOne('SELECT id FROM grade_rates WHERE institution_id=? AND grade=?', [instId, grade]);
    if (existing) {
        db.run('UPDATE grade_rates SET hourly_rate=? WHERE id=?', [rate, existing.id]);
    } else {
        db.run('INSERT INTO grade_rates (institution_id, grade, hourly_rate) VALUES (?, ?, ?)', [instId, grade, rate]);
    }
    debouncedSave();
    closeModal();
    openFeeSettings();
    showToast('已保存');
}

function batchSetGradeRate() {
    openModal('统一设置通用费率', `
        <div class="form-group"><label>所有年级统一每小时费用（元）</label>
            <input type="number" id="batch-rate-input" min="0" placeholder="输入金额">
        </div>
        <div class="form-actions">
            <button class="btn outline" onclick="closeModal()">取消</button>
            <button class="btn primary" onclick="doBatchSetRate()">确认设置</button>
        </div>
    `);
}

function doBatchSetRate() {
    const rate = parseFloat(document.getElementById('batch-rate-input').value) || 0;
    if (rate <= 0) { showToast('请输入有效金额'); return; }
    for (const g of GRADE_NAMES) {
        const existing = queryOne('SELECT id FROM grade_rates WHERE institution_id=0 AND grade=?', [g]);
        if (existing) {
            db.run('UPDATE grade_rates SET hourly_rate=? WHERE id=?', [rate, existing.id]);
        } else {
            db.run('INSERT INTO grade_rates (institution_id, grade, hourly_rate) VALUES (0, ?, ?)', [g, rate]);
        }
    }
    debouncedSave();
    closeModal();
    openFeeSettings();
    showToast('已统一设置');
}

// 获取年级费率（优先机构费率，其次通用费率）
function getGradeRate(instId, grade) {
    if (!grade) return 0;
    const instRate = queryOne('SELECT hourly_rate FROM grade_rates WHERE institution_id=? AND grade=?', [instId, grade]);
    if (instRate && instRate.hourly_rate > 0) return instRate.hourly_rate;
    const defaultRate = queryOne('SELECT hourly_rate FROM grade_rates WHERE institution_id=0 AND grade=?', [grade]);
    return defaultRate ? defaultRate.hourly_rate : 0;
}

// ==================== 设置 - 个人信息 ====================
function editProfile() {
    const nickname = queryOne("SELECT value FROM app_meta WHERE key='nickname'")?.value || '';
    openModal('个人信息', '<div class="form-group"><label>昵称</label><input type="text" id="profile-nickname-input" value="' + nickname + '" placeholder="输入昵称"></div><div class="form-actions"><button class="btn outline" onclick="closeModal()">取消</button><button class="btn primary" onclick="saveProfile()">保存</button></div>');
}
function saveProfile() {
    const n = document.getElementById('profile-nickname-input').value.trim();
    db.run("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('nickname', ?)", [n]);
    debouncedSave(); document.getElementById('profile-name').textContent = n || '未设置昵称';
    closeModal(); showToast('已保存');
}
function loadProfile() {
    const n = queryOne("SELECT value FROM app_meta WHERE key='nickname'")?.value || '';
    document.getElementById('profile-name').textContent = n || '未设置昵称';
}

// ==================== 导出 ====================
function openExport() {
    const now = new Date();
    const ms = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
    const me = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-31`;
    openModal('导出数据', '<div class="form-group"><label>日期范围</label><div class="date-row"><input type="date" id="export-start" value="' + ms + '"><span>至</span><input type="date" id="export-end" value="' + me + '"></div></div><div class="form-actions"><button class="btn outline" onclick="doExportCSV()">导出 CSV</button><button class="btn primary" onclick="doExportExcel()">导出 Excel</button></div>');
}
function doExportCSV() { const s = document.getElementById('export-start').value; const e = document.getElementById('export-end').value; const csv = ExportDB.toCSV(s, e); const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `课时费_${s}_${e}.csv`; a.click(); URL.revokeObjectURL(url); closeModal(); showToast('CSV已导出'); }
function doExportExcel() { const s = document.getElementById('export-start').value; const e = document.getElementById('export-end').value; const wb = ExportDB.toExcel(s, e); XLSX.writeFile(wb, `课时费_${s}_${e}.xlsx`); closeModal(); showToast('Excel已导出'); }

// ==================== 备份恢复 ====================
async function restoreBackup(input) { if (!input.files[0]) return; try { await BackupDB.importFile(input.files[0]); await loadAllData(); showToast('数据已恢复'); } catch (e) { showToast('恢复失败: ' + e.message); } input.value = ''; }

// ==================== 循环课程管理 ====================
function openRecurringManage() {
    const patterns = PatternDB.getActive(); const sm = {}; students.forEach(s => sm[s.id] = s);
    let html = '';
    if (patterns.length === 0) html = '<div class="empty-tip">暂无循环课程</div>';
    else { for (const p of patterns) { const s = sm[p.student_id]; if (!s) continue; const fl = p.frequency === 'biweekly' ? '隔周' : '每周'; const el = p.repeat_weeks > 0 ? '· ' + p.repeat_weeks + '周' : p.end_date ? '· 至' + p.end_date : p.repeat_end_date ? '· 至' + p.repeat_end_date : ''; html += `<div class="card-item"><div class="info"><div class="name">${s.name}</div><div class="sub">${DAY_NAMES[p.day_of_week]} ${p.start_time}-${p.end_time} (${fl})${el}</div></div><div class="actions"><button class="btn-sm" style="background:var(--success)" onclick="generateFromPattern(${p.id})">生成课程</button><button class="btn-sm" style="background:var(--danger)" onclick="deletePattern(${p.id})">删除</button></div></div>`; } }
    openModal('循环课程管理', html);
}
function generateFromPattern(pid) { const now = new Date(); const p = PatternDB.getById(pid); if (!p) return; const ed = p.end_date || p.repeat_end_date || formatDate(new Date(now.getTime() + 30*86400000)); const c = PatternDB.generateCourses(pid, formatDate(now), ed); loadCourses(); showToast('已生成' + c.length + '节课'); }
function deletePattern(pid) { PatternDB.delete(pid); openRecurringManage(); showToast('已删除'); }

// ==================== 初始化 ====================
setTimeout(() => { try { loadProfile(); } catch(e) {} }, 200);
