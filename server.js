const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());

const usersFile = path.join(__dirname, 'users.json');

function readUsers() {
    if (!fs.existsSync(usersFile)) return {};
    return JSON.parse(fs.readFileSync(usersFile, 'utf8') || '{}');
}

function saveUsers(users) {
    fs.writeFileSync(usersFile, JSON.stringify(users, null, 2), 'utf8');
}

let activeOTPs = {};

// 1. تسجيل الحساب
app.post('/api/auth/register', (req, res) => {
    const { username, email, password } = req.body;
    let users = readUsers();
    if (users[username]) {
        return res.json({ success: false, error: 'اسم المستخدم محجوز مسبقاً!' });
    }
    users[username] = { email: email.toLowerCase(), password: password };
    saveUsers(users);
    res.json({ success: true });
});

// 2. تسجيل الدخول
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    let users = readUsers();
    if (!users[username] || users[username].password !== password) {
        return res.json({ success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة!' });
    }
    res.json({ success: true });
});

// 3. نسيت كلمة المرور
app.post('/api/auth/forgot', (req, res) => {
    const { username, email } = req.body;
    let users = readUsers();
    if (!users[username] || users[username].email !== email.toLowerCase()) {
        return res.json({ success: false, error: 'البيانات المدخلة لا تطابق أي حساب!' });
    }
    const otpCode = Math.floor(1000 + Math.random() * 9000).toString();
    activeOTPs[username] = otpCode;
    res.json({ success: true, code: otpCode });
});

// 4. تعيين كلمة المرور الجديدة
app.post('/api/auth/reset', (req, res) => {
    const { username, otp, newPassword } = req.body;
    let users = readUsers();
    if (activeOTPs[username] !== otp) {
        return res.json({ success: false, error: 'كود التحقق خاطئ!' });
    }
    users[username].password = newPassword;
    saveUsers(users);
    delete activeOTPs[username];
    res.json({ success: true });
});

// --- نظام رفع الملفات مع التوجيه لصفحة التحميل المخصصة ---
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage, limits: { fileSize: 50 * 1024 * 1024 } });

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadDir));

app.post('/api/upload', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, error: 'لم يتم تحديد أي ملف!' });
    
    const fileName = req.file.originalname;
    const fileSize = (req.file.size / (1024 * 1024)).toFixed(2);
    
    // 🛠️ هان التعديل الذكي: نرسل المستخدم لصفحة download-page ونعطيه اسم الملف المرفوع كـ parameter
    // وتأكد إن اسم الملف عندك في ببلك هو download-page.html (إذا كان بالـ دَاش - أو الأندرسكور _ عدله بالسطر تحت)
    const downloadPageUrl = `${req.protocol}://${req.get('host')}/download-page.html?file=${req.file.filename}&name=${encodeURIComponent(fileName)}&size=${fileSize}`;
    
    // الـ QR كود الحين رح يفتح صفحة التحميل المخصصة فوراُ عند مسحه بالكاميرا
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(downloadPageUrl)}`;

    res.json({ success: true, fileName, fileSize, downloadUrl: downloadPageUrl, qrCode: qrCodeUrl });

    setTimeout(() => {
        fs.unlink(req.file.path, (err) => { if (!err) console.log(`تم حذف الملف: ${req.file.filename}`); });
    }, 3600000);
});

app.listen(PORT, () => {
    console.log(`السيرفر شغال وموجه لصفحة التحميل على البورت: ${PORT}`);
});