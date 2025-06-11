const express = require('express');
const session = require('express-session');
const path = require('path');
const app = express();
app.use(express.static('public'));

const PORT = process.env.PORT || 3000;
let students = [];  // Temporary in-memory list
const fs = require('fs');
const dataPath = path.join(__dirname, 'data', 'students.json');


// Load existing students from file

if (fs.existsSync(dataPath)) {
  const rawData = fs.readFileSync(dataPath);
  students = JSON.parse(rawData);
}

// TEMP user store (we'll use MongoDB later)
const users = [];

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));

// Setup session
app.use(session({
  secret: 'myschoolsecret', // change this later to something secure
  resave: false,
  saveUninitialized: true
}));
const multer = require('multer');
const uploadDir = path.join(__dirname, 'uploads');

// Create uploads folder if it doesn't exist
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

const upload = multer({ dest: uploadDir });
app.use('/uploads', express.static(uploadDir));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.get('/uploads', (req, res) => {
  if (!req.session.user) return res.redirect('/login');

  const uploadsMeta = JSON.parse(
    fs.existsSync(path.join(__dirname, 'data', 'uploads.json'))
      ? fs.readFileSync(path.join(__dirname, 'data', 'uploads.json'))
      : '[]'
  );

  const fileList = uploadsMeta.map(file => `
    <li>
      <a href="/uploads/${file.filename}" download>${file.originalname}</a><br>
      <small>📅 ${file.uploadDate} | 👤 ${file.uploadedBy}</small><br>
      <form action="/uploads/delete" method="POST" style="display:inline;">
        <input type="hidden" name="filename" value="${file.filename}" />
        <button type="submit" onclick="return confirm('Delete this file?')">🗑️ Delete</button>
      </form>
    </li>
  `).join('');

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Upload Files</title>
      <link rel="stylesheet" href="/style.css" />
    </head>
    <body>
      <h2>📁 Upload Student Documents</h2>

      <form action="/upload" method="POST" enctype="multipart/form-data">
        <input type="file" name="file" required />
        <button type="submit">Upload</button>
      </form>

      <h3>📄 Uploaded Files</h3>
      <ul>${fileList || '<li>No files uploaded yet.</li>'}</ul>

      <br><a href="/dashboard">⬅ Back to Dashboard</a>
    </body>
    </html>
  `);
});
app.get('/upload-category', (req, res) => {
  if (!req.session.user) return res.redirect('/login');

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Admin Upload by Category</title>
      <link rel="stylesheet" href="/style.css" />
    </head>
    <body>
      <h2>📤 Upload to Student Sections</h2>

      <form action="/upload-category" method="POST" enctype="multipart/form-data">
        <label>Select Category:
          <select name="category" required>
            <option value="results">Results</option>
            <option value="timetable">Timetable</option>
            <option value="notes">Notes</option>
          </select>
        </label><br><br>

        <label>Choose File:
          <input type="file" name="file" required />
        </label><br><br>

        <button type="submit">Upload File</button>
      </form>

      <br><a href="/dashboard">⬅ Back to Dashboard</a>
    </body>
    </html>
  `);
});


app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.session.user) return res.redirect('/login');

  if (!req.file) return res.send('No file uploaded.');

  const uploader = req.session.user.username || 'Unknown';
  const timestamp = new Date().toLocaleString();
  const uploadsPath = path.join(__dirname, 'data', 'uploads.json');

  let uploadMeta = [];
  if (fs.existsSync(uploadsPath)) {
    uploadMeta = JSON.parse(fs.readFileSync(uploadsPath));
  }

  uploadMeta.push({
    filename: req.file.filename,
    originalname: req.file.originalname,
    uploadedBy: uploader,
    uploadDate: timestamp
  });

  fs.writeFileSync(uploadsPath, JSON.stringify(uploadMeta, null, 2));

  res.redirect('/uploads');
});
app.post('/upload-category', upload.single('file'), (req, res) => {
  if (!req.session.user) return res.redirect('/login');

  const { category } = req.body;

  // Validate category
  const validFolders = ['results', 'timetable', 'notes'];
  if (!validFolders.includes(category)) return res.send('Invalid category.');

  const source = path.join(__dirname, 'uploads', req.file.filename);
  const destDir = path.join(__dirname, 'uploads', category);
  const dest = path.join(destDir, req.file.originalname);

  // Ensure the destination folder exists
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  // Move the file
  fs.renameSync(source, dest);

  res.send(`
    <p>✅ File uploaded successfully to <strong>${category}</strong>!</p>
    <a href="/upload-category">Upload Another</a> |
    <a href="/student-portal">View Student Portal</a> |
    <a href="/dashboard">Dashboard</a>
  `);
});

app.post('/uploads/delete', (req, res) => {
  const { filename } = req.body;

  const filePath = path.join(uploadDir, filename);
  const metaPath = path.join(__dirname, 'data', 'uploads.json');

  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  let uploadMeta = JSON.parse(fs.readFileSync(metaPath));
  uploadMeta = uploadMeta.filter(file => file.filename !== filename);
  fs.writeFileSync(metaPath, JSON.stringify(uploadMeta, null, 2));

  res.redirect('/uploads');
});

app.get('/student-portal', (req, res) => {
  const categories = ['results', 'timetable', 'notes'];
  const content = categories.map(folder => {
    const folderPath = path.join(__dirname, 'uploads', folder);
    const files = fs.existsSync(folderPath) ? fs.readdirSync(folderPath) : [];
    const links = files.map(file => `
      <li>
        <a href="/uploads/${folder}/${file}" download>${file}</a>
      </li>
    `).join('');

    return `
      <h3>📂 ${folder.charAt(0).toUpperCase() + folder.slice(1)}</h3>
      <ul>${links || '<li>No files available.</li>'}</ul>
    `;
  }).join('<hr>');

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Student Download Portal</title>
      <link rel="stylesheet" href="/style.css" />
    </head>
    <body>
      <h2>📥 Student Downloads</h2>
      ${content}
      <br><a href="/">⬅ Back to Home</a>
    </body>
    </html>
  `);
});
const teachersPath = path.join(__dirname, 'data', 'teachers.json');
let teachers = [];

if (fs.existsSync(teachersPath)) {
  try {
  const raw = fs.readFileSync(teachersPath);
  teachers = JSON.parse(raw.length ? raw : '[]');
} catch (err) {
  console.error('Error reading teachers.json:', err.message);
  teachers = [];
}

}
app.get('/teachers', (req, res) => {
  if (!req.session.user) return res.redirect('/login');

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Register Teacher</title>
      <link rel="stylesheet" href="/style.css">
    </head>
    <body>
      <h2>👩‍🏫 Register a New Teacher</h2>
      <form method="POST" action="/teachers">
        <label>Full Name:
          <input type="text" name="fullname" required />
        </label><br><br>

        <label>Subject:
          <input type="text" name="subject" required />
        </label><br><br>

        <label>Email:
          <input type="email" name="email" required />
        </label><br><br>

        <label>Assign to Class:
          <select name="class" required>
            <option value="">Select a class</option>
            <option>Primary 1</option>
            <option>Primary 2</option>
            <option>Primary 3</option>
            <option>Primary 4</option>
            <option>Primary 5</option>
            <option>Primary 6</option>
          </select>
        </label><br><br>

        <button type="submit">Register</button>
      </form>

      <br><a href="/teachers/list">📋 View All Teachers</a> |
      <a href="/dashboard">🏠 Dashboard</a>
    </body>
    </html>
  `);
});

app.get('/teachers/list', (req, res) => {
  if (!req.session.user) return res.redirect('/login');

  const rows = teachers.map((t, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${t.fullname}</td>
      <td>${t.subject}</td>
      <td>${t.email}</td>
      <td>${t.class || '-'}</td>
       <td>
      <form action="/teachers/delete" method="POST" onsubmit="return confirm('Delete this teacher?')" style="display:inline;">
        <input type="hidden" name="id" value="${t.id}">
        <button type="submit">🗑️ Delete</button>
      </form>
    </td>
    </tr>
  `).join('');

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Teachers List</title>
      <link rel="stylesheet" href="/style.css">
    </head>
    <body>
      <h2>📋 All Teachers</h2>
      <table border="1">
        <thead>
          <tr><th>#</th><th>Name</th><th>Subject</th><th>Email</th><th>Class</th><th>Actions</th></tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="4">No teachers yet.</td></tr>'}</tbody>
      </table>
      <br><a href="/teachers">⬅ Register New</a> |
      <a href="/dashboard">🏠 Dashboard</a>
    </body>
    </html>
  `);
});
app.post('/teachers', (req, res) => {
  if (!req.session.user) return res.redirect('/login');

  const { fullname, subject, email, class: assignedClass } = req.body;

  const newTeacher = {
    id: uuidv4(),
    fullname,
    subject,
    email,
    class: assignedClass
  };

  teachers.push(newTeacher);
  fs.writeFileSync(teachersPath, JSON.stringify(teachers, null, 2));

  res.send(`
    <h3>✅ Teacher Registered Successfully</h3>
    <p><strong>Name:</strong> ${fullname}</p>
    <a href="/teachers">⬅ Register Another</a> |
    <a href="/teachers/list">📋 View All</a> |
    <a href="/dashboard">🏠 Dashboard</a>
  `);
});
app.post('/teachers/delete', (req, res) => {
  if (!req.session.user) return res.redirect('/login');

  const { id } = req.body;
  teachers = teachers.filter(t => t.id !== id);
  fs.writeFileSync(teachersPath, JSON.stringify(teachers, null, 2));

  res.redirect('/teachers/list');
});
app.get('/student-login', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head><title>Student Login</title></head>
    <body>
      <h2>🎓 Student Login</h2>
      <form method="POST" action="/student-login">
        <label>Full Name: <input type="text" name="fullname" required /></label><br><br>
        <label>Password: <input type="password" name="password" required /></label><br><br>
        <button type="submit">Login</button>
      </form>
      <br><a href="/">⬅ Back to Home</a>
    </body>
    </html>
  `);
});

app.post('/student-login', (req, res) => {
  const { fullname, password } = req.body;

  const student = students.find(s =>
    s.fullname.toLowerCase() === fullname.toLowerCase() &&
    s.password === password
  );

  if (!student) {
    return res.send(`
      <p>❌ Invalid name or password.</p>
      <a href="/student-login">Try Again</a>
    `);
  }

  req.session.student = student;
  res.redirect('/student-dashboard');
});

app.get('/student-dashboard', (req, res) => {
  const student = req.session.student;
  if (!student) return res.redirect('/student-login');

  // Find class teacher
  const teacher = teachers.find(t => t.class === student.class);

  res.send(`
    <!DOCTYPE html>
    <html>
    <head><title>Student Dashboard</title></head>
    <body>
      <h2>👋 Welcome, ${student.fullname}</h2>
      <p><strong>Class:</strong> ${student.class}</p>
      <p><strong>Class Teacher:</strong> ${teacher ? teacher.fullname : 'Not assigned'}</p>

      <h3>📥 Your Downloads</h3>
      <ul>
        <li><a href="/uploads/results/${student.fullname.replace(/ /g, '_')}.pdf" download>📄 Your Result</a></li>
        <li><a href="/uploads/notes/${student.class.replace(/ /g, '_')}_notes.pdf" download>📝 Class Notes</a></li>
      </ul>

      <br><a href="/student-logout">🚪 Logout</a>
    </body>
    </html>
  `);
});
app.get('/student-logout', (req, res) => {
  req.session.student = null;
  res.redirect('/student-login');
});
const { v4: uuidv4 } = require('uuid');
// File paths
const dataDir = path.join(__dirname, 'data');
const announcementsPath = path.join(dataDir, 'announcements.json');
const studentsPath = path.join(dataDir, 'students.json');

// Home route (with auto-expiring announcements)
app.get('/', (req, res) => {
  let announcements = [];

  if (fs.existsSync(announcementsPath)) {
    announcements = JSON.parse(fs.readFileSync(announcementsPath));
  }

  const daysLimit = 7;
  const now = new Date();
  const recent = announcements.filter(a => {
    if (!a.date) return true;
    const posted = new Date(a.date);
    const diffDays = (now - posted) / (1000 * 60 * 60 * 24);
    return diffDays <= daysLimit;
  });

  const listItems = recent.map(a => `
    <li>
      ${a.message}<br>
      <small style="color:gray;">📅 ${a.timestamp}</small>
    </li>
  `).join('');

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Guree School Portal</title>
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <link rel="stylesheet" href="/style.css" />
    </head>
    <body style="font-family: Arial; padding: 40px; text-align: center;">
      <h1>🎓 Welcome to Guree Primary School Portal</h1>
      <p>Building the future, one child at a time.</p>

      <div style="max-width: 600px; margin: 40px auto; text-align: left;">
        <h3>📢 Latest Announcements</h3>
        <ul>${listItems || '<li>No recent announcements.</li>'}</ul>
      </div>

      <a href="/student-login">Student Login</a> |
      <a href="/dashboard">Admin Dashboard</a>
    </body>
    </html>
  `);
});

// Admin announcements form page
app.get('/admin/announcements', (req, res) => {
  if (!req.session.user) return res.redirect('/login');

  let announcements = [];
  if (fs.existsSync(announcementsPath)) {
    announcements = JSON.parse(fs.readFileSync(announcementsPath));
  }

  const list = announcements.map((a, index) => `
    <li>
      ${a.message}<br>
      <small>📅 ${a.timestamp}</small><br>
      <form method="POST" action="/admin/announcements/delete" style="display:inline;">
        <input type="hidden" name="index" value="${index}">
        <button type="submit">🗑️ Delete</button>
      </form>
    </li><br>
  `).join('');

  res.send(`
    <!DOCTYPE html>
    <html>
    <head><title>Manage Announcements</title></head>
    <body style="font-family: Arial; padding: 30px;">
      <h2>📢 Post New Announcement</h2>
      <form method="POST" action="/admin/announcements">
        <textarea name="message" rows="3" cols="50" required></textarea><br><br>
        <button type="submit">✅ Save Announcement</button>
      </form>
      <hr>
      <h3>🗂 All Announcements</h3>
      <ul>${list || '<li>No announcements posted yet.</li>'}</ul>
      <br><a href="/dashboard">⬅ Back to Dashboard</a>
    </body>
    </html>
  `);
});

// Save announcement
app.post('/admin/announcements', (req, res) => {
  if (!req.session.user) return res.redirect('/login');

  const { message } = req.body;
  const timestamp = new Date();
  const displayTime = timestamp.toLocaleString();

  let announcements = [];
  if (fs.existsSync(announcementsPath)) {
    announcements = JSON.parse(fs.readFileSync(announcementsPath));
  }

  announcements.unshift({
    message,
    timestamp: displayTime,
    date: timestamp.toISOString()
  });

  fs.writeFileSync(announcementsPath, JSON.stringify(announcements, null, 2));
  res.redirect('/admin/announcements');
});

// Delete announcement
app.post('/admin/announcements/delete', (req, res) => {
  if (!req.session.user) return res.redirect('/login');

  const index = parseInt(req.body.index);
  let announcements = JSON.parse(fs.readFileSync(announcementsPath));

  if (!isNaN(index)) {
    announcements.splice(index, 1);
    fs.writeFileSync(announcementsPath, JSON.stringify(announcements, null, 2));
  }

  res.redirect('/admin/announcements');
});
// Home Page

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Guree School Portal</title>
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <link rel="stylesheet" href="/style.css" />
    </head>
    <body style="text-align: center; padding: 30px;">
      <img src="/images/badge.jpg" alt="School Badge" style="height: 100px; margin-bottom: 20px;" />
      <h1>🎓 Welcome to Guree Primary School Portal</h1>
      <p>Building the future, one child at a time.</p>

      <a href="/student-login">Student Login</a> |
      <a href="/dashboard">Admin Dashboard</a>
    </body>
    </html>
  `);
});


// Register Page
app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

app.post('/register', (req, res) => {
  const { username, password } = req.body;
  const userExists = users.find(u => u.username === username);

  if (userExists) {
    return res.send('User already exists. Try logging in.');
  }

  users.push({ username, password });
  res.send('Registration successful! <a href="/login">Login</a>');
});

// Login Page
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const user = users.find(u => u.username === username && u.password === password);

  if (user) {
    req.session.user = user;
    res.redirect('/dashboard');
  } else {
    res.send('Invalid login. <a href="/login">Try again</a>');
  }
});

// Dashboard (protected)
app.get('/dashboard', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});
 

  // Students Page
  console.log("__dirname:", __dirname);
console.log("Looking for file:", path.join(__dirname, 'public', 'students.html'));
  app.get('/students', (req, res) => {
  if (!req.session.user) return res.redirect('/login');

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Register Student</title>
      <link rel="stylesheet" href="/style.css" />
    </head>
    <body>
      <h2>🧑‍🎓 Register Student</h2>
      <form method="POST" action="/students">
        <label>Full Name:
          <input type="text" name="fullname" required />
        </label><br><br>

        <label>Class:
          <input type="text" name="class" required />
        </label><br><br>

        <label>Gender:
          <select name="gender" required>
            <option>Male</option>
            <option>Female</option>
          </select>
        </label><br><br>

        <label>Date of Birth:
          <input type="date" name="dob" required />
        </label><br><br>

        <label>Set Password:
          <input type="password" name="password" required />
        </label><br><br>

        <button type="submit">Register</button>
      </form>

      <br><a href="/dashboard">⬅ Back to Dashboard</a>
    </body>
    </html>
  `);
});

app.post('/students', (req, res) => {
  if (!req.session.user) return res.redirect('/login');

  const { fullname, class: studentClass, gender, dob, password } = req.body;

  const newStudent = {
    id: uuidv4(),
    fullname,
    class: studentClass,
    gender,
    dob,
    password // ✅ Add this field
  };

  students.push(newStudent);
  fs.writeFileSync(dataPath, JSON.stringify(students, null, 2));

  res.send(`
    <h2>✅ Student Registered Successfully</h2>
    <p><strong>Name:</strong> ${fullname}</p>
    <a href="/students">⬅ Register Another</a> |
    <a href="/students/list">📋 View All</a> |
    <a href="/dashboard">🏠 Dashboard</a>
  `);
});

app.get('/students/list', (req, res) => {
  if (!req.session.user) return res.redirect('/login');

  const search = req.query.search?.toLowerCase() || '';
  const filtered = students.filter(student =>
    student.fullname.toLowerCase().includes(search)
  );

  let tableRows = filtered.map((student, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${student.fullname}</td>
      <td>${student.class}</td>
      <td>${student.gender}</td>
      <td>${student.dob}</td>
       <td>${student.password}</td>
      <td>
        <form method="POST" action="/students/delete" onsubmit="return confirm('Delete student?');">
          <input type="hidden" name="id" value="${student.id}">
          <button type="submit">🗑️ Delete</button>
        </form>
      </td>
    </tr>
  `).join('');

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>All Registered Students</title>
      <link rel="stylesheet" href="/style.css">
      <style>
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 20px;
        }
        th, td {
          padding: 12px;
          border: 1px solid #ccc;
          text-align: left;
        }
        th {
          background-color: #1e3a8a;
          color: white;
        }
      </style>
    </head>
    <body>
      <h2>📋 All Registered Students</h2>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Full Name</th>
            <th>Class</th>
            <th>Gender</th>
            <th>Date of Birth</th>
            <th>Password</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows || '<tr><td colspan="6">No students registered yet.</td></tr>'}
        </tbody>
      </table>
      <br>
      <a href="/students">⬅ Register New Student</a> |
      <a href="/dashboard">🏠 Dashboard</a>
    </body>
    </html>
  `);
});

app.post('/students/delete', (req, res) => {
  const { id } = req.body;
  students = students.filter(s => s.id !== id);
  fs.writeFileSync(dataPath, JSON.stringify(students, null, 2));
  res.redirect('/students/list');
});


  
  // Results Page
  app.get('/results', (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    res.sendFile(path.join(__dirname, 'public', 'results.html'));
  });
  
  // Timetable Page
  app.get('/timetable', (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    res.sendFile(path.join(__dirname, 'public', 'timetable.html'));
  });
    
// Logout
app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

