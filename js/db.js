/**
 * 排课App - 数据库层 (sql.js)
 * 替代 Python database.py，所有数据存储在浏览器 IndexedDB 中
 */

let db = null;

// ==================== 初始化 ====================
async function initDB() {
    const SQL = await initSqlJs({
        locateFile: file => `lib/${file}`
    });
    
    const saved = await loadFromIndexedDB();
    if (saved) {
        db = new SQL.Database(new Uint8Array(saved));
    } else {
        db = new SQL.Database();
    }
    
    // 创建表
    db.run(`
        CREATE TABLE IF NOT EXISTS institutions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            color TEXT NOT NULL,
            pay_day INTEGER DEFAULT 0,
            last_pay_date TEXT DEFAULT '',
            created_at TEXT DEFAULT (datetime('now','localtime'))
        )
    `);
    
    db.run(`
        CREATE TABLE IF NOT EXISTS students (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            institution_id INTEGER NOT NULL,
            hourly_rate REAL NOT NULL DEFAULT 150,
            rate_type TEXT DEFAULT 'hourly',
            fixed_rate REAL,
            created_at TEXT DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (institution_id) REFERENCES institutions(id)
        )
    `);
    
    db.run(`
        CREATE TABLE IF NOT EXISTS recurring_patterns (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id INTEGER NOT NULL,
            day_of_week INTEGER NOT NULL,
            start_time TEXT NOT NULL,
            end_time TEXT NOT NULL,
            start_date TEXT NOT NULL,
            end_date TEXT DEFAULT '',
            is_active INTEGER DEFAULT 1,
            frequency TEXT DEFAULT 'weekly',
            repeat_weeks INTEGER DEFAULT 0,
            repeat_end_date TEXT DEFAULT '',
            created_at TEXT DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (student_id) REFERENCES students(id)
        )
    `);
    
    db.run(`
        CREATE TABLE IF NOT EXISTS courses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id INTEGER NOT NULL,
            pattern_id INTEGER DEFAULT 0,
            course_date TEXT NOT NULL,
            start_time TEXT NOT NULL,
            end_time TEXT NOT NULL,
            duration_hours REAL NOT NULL,
            fee REAL NOT NULL,
            created_at TEXT DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (student_id) REFERENCES students(id)
        )
    `);
    
    db.run(`
        CREATE TABLE IF NOT EXISTS salary_payments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            institution_id INTEGER NOT NULL,
            payment_date TEXT NOT NULL,
            total_amount REAL NOT NULL,
            period_start TEXT DEFAULT '',
            period_end TEXT DEFAULT '',
            note TEXT DEFAULT '',
            created_at TEXT DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (institution_id) REFERENCES institutions(id)
        )
    `);
    
    db.run(`
        CREATE TABLE IF NOT EXISTS app_meta (
            key TEXT PRIMARY KEY,
            value TEXT
        )
    `);
    
    db.run(`
        CREATE TABLE IF NOT EXISTS grade_rates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            institution_id INTEGER DEFAULT 0,
            grade TEXT NOT NULL,
            hourly_rate REAL NOT NULL DEFAULT 0,
            UNIQUE(institution_id, grade)
        )
    `);
    
    // 设置版本号
    db.run(`INSERT OR REPLACE INTO app_meta (key, value) VALUES ('db_version', '5')`);
    
    // 迁移：确保 repeat_weeks 和 repeat_end_date 列存在
    try { db.run(`ALTER TABLE recurring_patterns ADD COLUMN repeat_weeks INTEGER DEFAULT 0`); } catch(e) {}
    try { db.run(`ALTER TABLE recurring_patterns ADD COLUMN repeat_end_date TEXT DEFAULT ''`); } catch(e) {}
    
    console.log('数据库初始化完成');
}

// ==================== 持久化 ====================
async function saveToIndexedDB() {
    const data = db.export();
    const buffer = data.buffer;
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('SchedulerDB', 1);
        request.onupgradeneeded = e => {
            e.target.result.createObjectStore('db');
        };
        request.onsuccess = e => {
            const tx = e.target.result.transaction('db', 'readwrite');
            tx.objectStore('db').put(buffer, 'scheduler');
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        };
        request.onerror = () => reject(request.error);
    });
}

let _saveTimer = null;
function debouncedSave() {
    if (_saveTimer) clearTimeout(_saveTimer);
    _saveTimer = setTimeout(() => {
        saveToIndexedDB().catch(e => console.error('debouncedSave失败:', e));
        _saveTimer = null;
    }, 300);
}

async function loadFromIndexedDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('SchedulerDB', 1);
        request.onupgradeneeded = e => {
            e.target.result.createObjectStore('db');
        };
        request.onsuccess = e => {
            const tx = e.target.result.transaction('db', 'readonly');
            const getReq = tx.objectStore('db').get('scheduler');
            getReq.onsuccess = () => resolve(getReq.result || null);
            getReq.onerror = () => reject(getReq.error);
        };
        request.onerror = () => reject(request.error);
    });
}

// ==================== 辅助函数 ====================
function dateToStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function todayStr() {
    return dateToStr(new Date());
}

function queryAll(sql, params = []) {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const results = [];
    while (stmt.step()) {
        results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
}

function queryOne(sql, params = []) {
    const results = queryAll(sql, params);
    return results.length > 0 ? results[0] : null;
}

function runSQL(sql, params = []) {
    db.run(sql, params);
}

function getLastId() {
    const result = queryOne('SELECT last_insert_rowid() as id');
    return result ? result.id : 0;
}

// ==================== 机构 CRUD ====================
const InstitutionDB = {
    getAll() {
        return queryAll('SELECT * FROM institutions ORDER BY name');
    },
    
    getById(id) {
        return queryOne('SELECT * FROM institutions WHERE id = ?', [id]);
    },
    
    create(data) {
        runSQL(
            'INSERT INTO institutions (name, color, pay_day, last_pay_date) VALUES (?, ?, ?, ?)',
            [data.name, data.color, data.pay_day || 0, data.last_pay_date || '']
        );
        const newId = getLastId();
        debouncedSave();
        return newId;
    },
    
    update(id, data) {
        const inst = this.getById(id);
        if (!inst) return null;
        runSQL(
            'UPDATE institutions SET name=?, color=?, pay_day=?, last_pay_date=? WHERE id=?',
            [data.name ?? inst.name, data.color ?? inst.color, 
             data.pay_day ?? inst.pay_day, data.last_pay_date ?? inst.last_pay_date, id]
        );
        debouncedSave();
        return id;
    },
    
    delete(id) {
        const students = StudentDB.getByInstitution(id);
        if (students.length > 0) {
            throw new Error(`该机构下还有${students.length}个学生，无法删除`);
        }
        runSQL('DELETE FROM institutions WHERE id=?', [id]);
        debouncedSave();
    }
};

// ==================== 学生 CRUD ====================
const StudentDB = {
    getAll() {
        return queryAll(`
            SELECT s.*, i.name as institution_name, i.color as institution_color
            FROM students s
            LEFT JOIN institutions i ON s.institution_id = i.id
            ORDER BY s.name
        `);
    },
    
    getById(id) {
        return queryOne('SELECT * FROM students WHERE id=?', [id]);
    },
    
    getByInstitution(institutionId) {
        return queryAll('SELECT * FROM students WHERE institution_id=? ORDER BY name', [institutionId]);
    },
    
    create(data) {
        runSQL(
            `INSERT INTO students (name, institution_id, hourly_rate, rate_type, fixed_rate, student_type) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [data.name, data.institution_id, data.hourly_rate || 150, 
             data.rate_type || 'hourly', data.fixed_rate || null, data.student_type || '1v1']
        );
        const newId = getLastId();
        debouncedSave();
        return newId;
    },
    
    update(id, data) {
        const s = this.getById(id);
        if (!s) return null;
        runSQL(
            `UPDATE students SET name=?, institution_id=?, hourly_rate=?, rate_type=?, fixed_rate=?, student_type=? WHERE id=?`,
            [data.name ?? s.name, data.institution_id ?? s.institution_id,
             data.hourly_rate ?? s.hourly_rate, data.rate_type ?? s.rate_type,
             data.fixed_rate ?? s.fixed_rate, data.student_type ?? s.student_type ?? '1v1', id]
        );
        debouncedSave();
        return id;
    },
    
    delete(id) {
        runSQL('DELETE FROM courses WHERE student_id=?', [id]);
        runSQL('DELETE FROM recurring_patterns WHERE student_id=?', [id]);
        runSQL('DELETE FROM students WHERE id=?', [id]);
        debouncedSave();
    },
    
    calculateFee(student, durationHours) {
        if (student.rate_type === 'fixed' && student.fixed_rate) {
            return student.fixed_rate;
        }
        return student.hourly_rate * durationHours;
    }
};

// ==================== 年级费率 CRUD ====================
const GradeRateDB = {
    getAll() {
        return queryAll('SELECT * FROM grade_rates ORDER BY institution_id, grade');
    },
    
    getByInstitution(institutionId) {
        return queryAll('SELECT * FROM grade_rates WHERE institution_id=?', [institutionId]);
    },
    
    getRate(institutionId, grade) {
        return queryOne('SELECT * FROM grade_rates WHERE institution_id=? AND grade=?', [institutionId, grade]);
    },
    
    setRate(institutionId, grade, hourlyRate) {
        const existing = this.getRate(institutionId, grade);
        if (existing) {
            runSQL('UPDATE grade_rates SET hourly_rate=? WHERE id=?', [hourlyRate, existing.id]);
        } else {
            runSQL('INSERT INTO grade_rates (institution_id, grade, hourly_rate) VALUES (?, ?, ?)',
                [institutionId, grade, hourlyRate]);
        }
        debouncedSave();
    },
    
    batchSet(institutionId, hourlyRate) {
        const GRADE_NAMES = [
            '一年级', '二年级', '三年级', '四年级', '五年级', '六年级',
            '初一', '初二', '初三', '高一', '高二', '高三'
        ];
        for (const grade of GRADE_NAMES) {
            this.setRate(institutionId, grade, hourlyRate);
        }
    },
    
    deleteByInstitution(institutionId) {
        runSQL('DELETE FROM grade_rates WHERE institution_id=?', [institutionId]);
        debouncedSave();
    }
};

// ==================== 循环课程模式 CRUD ====================
const PatternDB = {
    getByStudent(studentId) {
        return queryAll(
            'SELECT * FROM recurring_patterns WHERE student_id=? ORDER BY day_of_week',
            [studentId]
        );
    },
    
    getActive() {
        return queryAll('SELECT * FROM recurring_patterns WHERE is_active=1');
    },
    
    getById(id) {
        return queryOne('SELECT * FROM recurring_patterns WHERE id=?', [id]);
    },
    
    create(data) {
        runSQL(
            `INSERT INTO recurring_patterns (student_id, day_of_week, start_time, end_time, start_date, end_date, is_active, frequency, repeat_weeks, repeat_end_date)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [data.student_id, data.day_of_week, data.start_time, data.end_time,
             data.start_date || todayStr(),
             data.end_date || '', 1, data.frequency || 'weekly',
             data.repeat_weeks || 0, data.repeat_end_date || '']
        );
        const newId = getLastId();
        debouncedSave();
        return newId;
    },
    
    update(id, data) {
        const p = this.getById(id);
        if (!p) return null;
        runSQL(
            `UPDATE recurring_patterns SET day_of_week=?, start_time=?, end_time=?, 
             start_date=?, end_date=?, is_active=?, frequency=?, repeat_weeks=?, repeat_end_date=? WHERE id=?`,
            [data.day_of_week ?? p.day_of_week, data.start_time ?? p.start_time,
             data.end_time ?? p.end_time, data.start_date ?? p.start_date,
             data.end_date ?? p.end_date, data.is_active ?? p.is_active,
             data.frequency ?? p.frequency, data.repeat_weeks ?? p.repeat_weeks,
             data.repeat_end_date ?? p.repeat_end_date, id]
        );
        debouncedSave();
        return id;
    },
    
    delete(id) {
        runSQL('DELETE FROM recurring_patterns WHERE id=?', [id]);
        debouncedSave();
    },
    
    generateCourses(patternId, startDate, endDate) {
        const pattern = this.getById(patternId);
        if (!pattern) return [];
        
        const student = StudentDB.getById(pattern.student_id);
        if (!student) return [];
        
        const created = [];
        let current = new Date(startDate + 'T00:00:00');
        const end = new Date(endDate + 'T00:00:00');
        
        while (current <= end) {
            const dayOfWeek = current.getDay() === 0 ? 7 : current.getDay();
            
            if (dayOfWeek === pattern.day_of_week) {
                let shouldGenerate = false;
                if (pattern.frequency === 'biweekly') {
                    const jan1 = new Date(current.getFullYear(), 0, 1);
                    const weekOfYear = Math.floor((current - jan1) / (7 * 86400000));
                    if (weekOfYear % 2 === 0) shouldGenerate = true;
                } else {
                    shouldGenerate = true;
                }
                
                if (shouldGenerate) {
                    const dateStr = `${current.getFullYear()}-${String(current.getMonth()+1).padStart(2,'0')}-${String(current.getDate()).padStart(2,'0')}`;
                    
                    const existing = queryOne(
                        `SELECT id FROM courses WHERE student_id=? AND course_date=? AND start_time=?`,
                        [student.id, dateStr, pattern.start_time]
                    );
                    
                    if (!existing) {
                        const start = parseTime(pattern.start_time);
                        const endT = parseTime(pattern.end_time);
                        let duration = (endT - start) / 3600000;
                        if (duration <= 0) duration += 24;
                        const fee = StudentDB.calculateFee(student, duration);
                        
                        runSQL(
                            `INSERT INTO courses (student_id, pattern_id, course_date, start_time, end_time, duration_hours, fee)
                             VALUES (?, ?, ?, ?, ?, ?, ?)`,
                            [student.id, patternId, dateStr, pattern.start_time, pattern.end_time, duration, fee]
                        );
                        created.push(getLastId());
                    }
                }
            }
            
            current.setDate(current.getDate() + 1);
        }
        
        debouncedSave();
        return created;
    }
};

// ==================== 课程 CRUD ====================
const CourseDB = {
    getAll() {
        return queryAll(`
            SELECT c.*, s.name as student_name, s.institution_id,
                   i.name as institution_name, i.color as institution_color
            FROM courses c
            LEFT JOIN students s ON c.student_id = s.id
            LEFT JOIN institutions i ON s.institution_id = i.id
            ORDER BY c.course_date, c.start_time
        `);
    },
    
    getByDateRange(startDate, endDate) {
        return queryAll(`
            SELECT c.*, s.name as student_name, s.institution_id,
                   i.name as institution_name, i.color as institution_color
            FROM courses c
            LEFT JOIN students s ON c.student_id = s.id
            LEFT JOIN institutions i ON s.institution_id = i.id
            WHERE c.course_date BETWEEN ? AND ?
            ORDER BY c.course_date, c.start_time
        `, [startDate, endDate]);
    },
    
    getByStudent(studentId) {
        return queryAll(`
            SELECT c.*, s.name as student_name, s.institution_id,
                   i.name as institution_name, i.color as institution_color
            FROM courses c
            LEFT JOIN students s ON c.student_id = s.id
            LEFT JOIN institutions i ON s.institution_id = i.id
            WHERE c.student_id=?
            ORDER BY c.course_date, c.start_time
        `, [studentId]);
    },
    
    getById(id) {
        return queryOne(`
            SELECT c.*, s.name as student_name, s.institution_id,
                   i.name as institution_name, i.color as institution_color
            FROM courses c
            LEFT JOIN students s ON c.student_id = s.id
            LEFT JOIN institutions i ON s.institution_id = i.id
            WHERE c.id=?
        `, [id]);
    },
    
    create(data) {
        const student = StudentDB.getById(data.student_id);
        if (!student) throw new Error('学生不存在');
        
        const start = parseTime(data.start_time);
        const end = parseTime(data.end_time);
        let duration = (end - start) / 3600000;
        if (duration <= 0) duration += 24;
        
        const fee = StudentDB.calculateFee(student, duration);
        
        runSQL(
            `INSERT INTO courses (student_id, pattern_id, course_date, start_time, end_time, duration_hours, fee)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [data.student_id, data.pattern_id || 0, data.course_date,
             data.start_time, data.end_time, duration, fee]
        );
        const newId = getLastId();
        debouncedSave();
        return { id: newId, fee, duration_hours: duration };
    },
    
    batchCreate(data) {
        const student = StudentDB.getById(data.student_id);
        if (!student) throw new Error('学生不存在');
        
        const created = [];
        let current = new Date(data.start_date + 'T00:00:00');
        const end = new Date(data.end_date + 'T00:00:00');
        
        while (current <= end) {
            const dayOfWeek = current.getDay() === 0 ? 7 : current.getDay();
            
            for (const slot of data.schedule) {
                if (slot.day_of_week === dayOfWeek) {
                    const dateStr = `${current.getFullYear()}-${String(current.getMonth()+1).padStart(2,'0')}-${String(current.getDate()).padStart(2,'0')}`;
                    
                    const existing = queryOne(
                        `SELECT id FROM courses WHERE student_id=? AND course_date=? AND start_time=?`,
                        [data.student_id, dateStr, slot.start_time]
                    );
                    
                    if (!existing) {
                        const start = parseTime(slot.start_time);
                        const endT = parseTime(slot.end_time);
                        let duration = (endT - start) / 3600000;
                        if (duration <= 0) duration += 24;
                        
                        if (duration > 0) {
                            const fee = StudentDB.calculateFee(student, duration);
                            runSQL(
                                `INSERT INTO courses (student_id, pattern_id, course_date, start_time, end_time, duration_hours, fee)
                                 VALUES (?, 0, ?, ?, ?, ?, ?)`,
                                [data.student_id, dateStr, slot.start_time, slot.end_time, duration, fee]
                            );
                            created.push(getLastId());
                        }
                    }
                }
            }
            
            current.setDate(current.getDate() + 1);
        }
        
        debouncedSave();
        return { created: created.length, course_ids: created };
    },
    
    update(id, data) {
        const course = queryOne('SELECT * FROM courses WHERE id=?', [id]);
        if (!course) throw new Error('课程不存在');
        
        const student = StudentDB.getById(data.student_id || course.student_id);
        if (!student) throw new Error('学生不存在');
        
        const startTime = data.start_time || course.start_time;
        const endTime = data.end_time || course.end_time;
        const start = parseTime(startTime);
        const end = parseTime(endTime);
        const duration = (end - start) / 3600000;
        const fee = StudentDB.calculateFee(student, duration);
        
        runSQL(
            `UPDATE courses SET student_id=?, course_date=?, start_time=?, end_time=?, duration_hours=?, fee=? WHERE id=?`,
            [data.student_id || course.student_id, data.course_date || course.course_date,
             startTime, endTime, duration, fee, id]
        );
        debouncedSave();
        return { id, fee, duration_hours: duration };
    },
    
    delete(id) {
        runSQL('DELETE FROM courses WHERE id=?', [id]);
        debouncedSave();
    }
};

// ==================== 工资发放 CRUD ====================
const SalaryDB = {
    getByInstitution(institutionId) {
        return queryAll(
            'SELECT * FROM salary_payments WHERE institution_id=? ORDER BY payment_date DESC',
            [institutionId]
        );
    },
    
    getAll() {
        return queryAll('SELECT * FROM salary_payments');
    },
    
    getSettledAmount(institutionId) {
        const result = queryOne(
            'SELECT COALESCE(SUM(total_amount), 0) as total FROM salary_payments WHERE institution_id=?',
            [institutionId]
        );
        return result ? result.total : 0;
    },
    
    settle(data) {
        const instId = data.institution_id;
        let amount = data.amount;
        let periodStart = '';
        let periodEnd = '';
        
        if (amount === undefined || amount === null) {
            const students = StudentDB.getByInstitution(instId);
            let totalAmount = 0;
            let allDates = [];
            
            for (const s of students) {
                const courses = CourseDB.getByStudent(s.id);
                for (const c of courses) {
                    totalAmount += c.fee;
                    allDates.push(c.course_date);
                }
            }
            
            const settled = this.getSettledAmount(instId);
            amount = totalAmount - settled;
            
            if (amount <= 0) throw new Error('没有未结算的金额');
            
            if (allDates.length > 0) {
                allDates.sort();
                periodStart = allDates[0];
                periodEnd = allDates[allDates.length - 1];
            }
        } else {
            if (amount <= 0) throw new Error('金额必须大于0');
        }
        
        const inst = InstitutionDB.getById(instId);
        if (inst) {
            InstitutionDB.update(instId, { last_pay_date: todayStr() });
        }
        
        const today = todayStr();
        runSQL(
            `INSERT INTO salary_payments (institution_id, payment_date, total_amount, period_start, period_end, note)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [instId, today, amount, periodStart, periodEnd, data.note || '']
        );
        debouncedSave();
        return { success: true, amount };
    },
    
    undo(paymentId) {
        runSQL('DELETE FROM salary_payments WHERE id=?', [paymentId]);
        debouncedSave();
    },
    
    getReminders() {
        const today = new Date();
        const reminders = [];
        
        for (const inst of InstitutionDB.getAll()) {
            if (inst.pay_day > 0) {
                let nextPay;
                if (today.getDate() <= inst.pay_day) {
                    nextPay = new Date(today.getFullYear(), today.getMonth(), inst.pay_day);
                } else {
                    nextPay = new Date(today.getFullYear(), today.getMonth() + 1, inst.pay_day);
                }
                
                const daysUntil = Math.ceil((nextPay - today) / 86400000);
                
                const students = StudentDB.getByInstitution(inst.id);
                let totalFee = 0;
                for (const s of students) {
                    const courses = CourseDB.getByStudent(s.id);
                    totalFee += courses.reduce((sum, c) => sum + c.fee, 0);
                }
                
                const settled = this.getSettledAmount(inst.id);
                const pending = Math.max(0, totalFee - settled);
                
                reminders.push({
                    institution_id: inst.id,
                    institution_name: inst.name,
                    institution_color: inst.color,
                    pay_day: inst.pay_day,
                    next_pay_date: dateToStr(nextPay),
                    days_until: daysUntil,
                    last_pay_date: inst.last_pay_date,
                    pending_amount: pending,
                    is_urgent: daysUntil <= 3
                });
            }
        }
        
        reminders.sort((a, b) => a.days_until - b.days_until);
        return reminders;
    }
};

// ==================== 导出 ====================
const ExportDB = {
    toCSV(startDate, endDate) {
        const courses = CourseDB.getByDateRange(startDate, endDate);
        
        let csv = '\uFEFF';
        csv += '日期,开始时间,结束时间,时长(h),学生,机构,课时费(元)\n';
        
        let totalFee = 0;
        for (const c of courses) {
            csv += `${c.course_date},${c.start_time},${c.end_time},${c.duration_hours.toFixed(1)},${c.student_name},${c.institution_name},${c.fee.toFixed(0)}\n`;
            totalFee += c.fee;
        }
        
        csv += `\n,,,,,,合计: ${totalFee.toFixed(0)}元\n`;
        return csv;
    },
    
    toExcel(startDate, endDate) {
        const courses = CourseDB.getByDateRange(startDate, endDate);
        
        const data = [['日期', '开始时间', '结束时间', '时长(h)', '学生', '机构', '课时费(元)']];
        let totalFee = 0;
        
        for (const c of courses) {
            data.push([c.course_date, c.start_time, c.end_time, 
                       parseFloat(c.duration_hours.toFixed(1)), c.student_name, 
                       c.institution_name, parseFloat(c.fee.toFixed(0))]);
            totalFee += c.fee;
        }
        
        data.push([]);
        data.push(['', '', '', '', '', '', `合计: ${totalFee.toFixed(0)}元`]);
        
        const ws = XLSX.utils.aoa_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, '课时费明细');
        
        return wb;
    }
};

// ==================== 冲突检测 ====================
const ConflictDB = {
    checkOverlap(date, startTime, endTime, excludeId = 0) {
        const courses = CourseDB.getByDateRange(date, date);
        const conflicts = [];
        const newStart = parseTime(startTime);
        const newEnd = parseTime(endTime);

        for (const c of courses) {
            if (c.id === excludeId) continue;
            const existStart = parseTime(c.start_time);
            const existEnd = parseTime(c.end_time);
            if (newStart < existEnd && newEnd > existStart) {
                conflicts.push(c);
            }
        }
        return conflicts;
    }
};

// ==================== 工具函数 ====================
function parseTime(timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const date = new Date(2000, 0, 1, hours, minutes, 0);
    return date.getTime();
}

// ==================== 数据导入/导出（备份恢复）====================
const BackupDB = {
    async exportAll() {
        const data = db.export();
        const blob = new Blob([data], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `排课数据_${todayStr()}.db`;
        a.click();
        URL.revokeObjectURL(url);
    },
    
    async importFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const SQL = await initSqlJs({
                        locateFile: f => `lib/${f}`
                    });
                    const newDb = new SQL.Database(new Uint8Array(e.target.result));
                    
                    const tables = newDb.exec("SELECT name FROM sqlite_master WHERE type='table'");
                    const tableNames = tables[0]?.values.map(r => r[0]) || [];
                    
                    if (!tableNames.includes('institutions') || !tableNames.includes('courses')) {
                        reject(new Error('无效的数据库文件'));
                        return;
                    }
                    
                    db = newDb;
                    await saveToIndexedDB();
                    resolve();
                } catch (err) {
                    reject(err);
                }
            };
            reader.readAsArrayBuffer(file);
        });
    }
};
