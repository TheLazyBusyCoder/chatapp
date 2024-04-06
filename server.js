const express = require("express");
const mysql = require("mysql");
const session = require("express-session");
const cookieParser = require("cookie-parser");
const app = express();
const PORT = process.env.PORT || 3000;

app.use(
    session({
        secret: "123456789",
        resave: true,
        saveUninitialized: true,
    })
);
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.set("view engine", "ejs");
app.set("views", "./src/views");

const con = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "",
    database: "chatapp",
});

con.connect((err) => {
    if (err) {
        console.error("Error connecting to database:", err);
        return;
    }
    console.log("Connected to MySQL database");
});

app.get(["/", "/home"], (req, res) => {
    console.log(req.cookies.name);
    if (req.session.code) {
        res.render("home", { code: req.session.code, name: req.cookies.name || "" });
    } else res.render("home", { code: false, name: "" });
});

// route to create table. (hoster)
app.get("/hosterpage", (req, res) => {
    const code = req.session.code;
    if (code == undefined) res.redirect("/home");
    const codestr = `tableforcode_${code}`;
    con.query(
        `SELECT COUNT(*) AS te FROM information_schema.tables WHERE table_schema = 'chatapp' AND table_name = '${codestr}'`,
        (err, rs1) => {
            const exist = rs1[0].te;
            // table is there.
            if (exist == 1) {
                res.redirect("/home?msg=roomthere");
            } else {
                // table is not there.
                con.query(
                    `create table ${codestr}(sender_name text, message text,time BIGINT, INDEX(time))`,
                    (err, rs2) => {
                        if (err) {
                            console.error("Error creating table:", err);
                            return;
                        }
                        res.redirect("/home?msg=roomcreated");
                    }
                );
            }
        }
    );
});

app.post("/joinbycode", (req, res) => {
    const { code } = req.body;
    const codestr = `tableforcode_${code}`;
    con.query(
        `SELECT COUNT(*) AS te FROM information_schema.tables WHERE table_schema = 'chatapp' AND table_name = '${codestr}'`,
        (err, rs1) => {
            const exist = rs1[0].te;
            // table is there.
            if (exist == 1) {
                console.log("Table exist" + " " + codestr);
                req.session.code = code;
                res.redirect("/chattingpage");
            } else {
                res.redirect("/home?msg=tablenotthere");
            }
        }
    );
});

app.get("/chattingpage", (req, res) => {
    const code = req.session.code;
    if (code == undefined) return res.redirect("/home?msg=noaccess");
    const codestr = `tableforcode_${code}`;
    return res.render("chattingpage", { code, name: req.cookies.name });
});

app.post("/getmsg", (req, res) => {
    const code = req.session.code;
    if (!code) {
        res.json({ msg: "no access" });
    }
    const codestr = `tableforcode_${code}`;
    con.query(`select * from ${codestr} order by time DESC`, (err, result) => {
        if (err) {
            console.log(err);
            res.json({ msg: "Error sending message" });
        }
        let html = "";
        result.forEach((e) => {
            var date = new Date(e.time);
            var hours = date.getHours().toString().padStart(2, "0");
            var minutes = date.getMinutes().toString().padStart(2, "0");
            var seconds = date.getSeconds().toString().padStart(2, "0");
            var timeString = hours + ":" + minutes + ":" + seconds;
            html = html + `<tr><td>${e.sender_name}</td> <td>${e.message}</td> <td>${timeString}</td></tr>`;
        });
        res.json({ html });
    });
});

app.post("/setname", (req, res) => {
    const { name } = req.body;
    res.cookie("name", name, {
        httpOnly: true,
        maxAge: 60 * 60 * 24 * 7,
        path: "/",
    });
    res.json({ msg: "done" });
});

app.post("/sendmsg", (req, res) => {
    const code = req.session.code;
    const name = req.cookies.name;
    const { msg } = req.body;
    const codestr = `tableforcode_${code}`;
    console.log(code + " " + msg);
    con.query(`insert into ${codestr} values(?,?,?)`, [name, msg, Date.now()], (err, result) => {
        if (err) {
            console.log(err);
            res.json({ msg: "Error sending message" });
        }
        res.json({ msg: "successful" });
    });
});

// user get access code here
app.post("/getaccesscode", (req, res) => {
    // Get access code in the table.
    con.query("SELECT * FROM access_codes", (err, rs1) => {
        if (err) {
            console.error("Error executing SELECT query:", err);
            return res.status(500).send("Error executing SELECT query");
        }
        // Check if the table is empty.
        if (rs1.length === 0) {
            // If the table is empty, insert a new row.
            con.query("INSERT INTO access_codes (busy) VALUES (?)", [true], (err, rs2) => {
                if (err) {
                    console.error("Error inserting data:", err);
                    return res.status(500).send("Error inserting data");
                }
                // Get the last value in the table.
                con.query("SELECT * FROM access_codes ORDER BY code DESC LIMIT 1", (err, rs3) => {
                    if (err) {
                        console.error("Error executing SELECT last query:", err);
                        return res.status(500).send("Error executing SELECT last query");
                    }
                    console.log("Last row:", rs3[0]); // Log the last row
                    req.session.code = rs3[0].code;
                    return res.redirect("/hosterpage");
                });
            });
        } else {
            // If there are values in the table, set session code and redirect
            con.query("INSERT INTO access_codes (busy) VALUES (?)", [true], (err, rs2) => {
                if (err) {
                    console.error("Error inserting data:", err);
                    return res.status(500).send("Error inserting data");
                }
                // Get the last value in the table.
                con.query("SELECT * FROM access_codes ORDER BY code DESC LIMIT 1", (err, rs3) => {
                    if (err) {
                        console.error("Error executing SELECT last query:", err);
                        return res.status(500).send("Error executing SELECT last query");
                    }
                    console.log("Last row:", rs3[0]); // Log the last row
                    req.session.code = rs3[0].code;
                    return res.redirect("/hosterpage");
                });
            });
        }
    });
});

const server = app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

server.on("close", function () {
    con.end((e) => {
        console.log("Disconnected from database");
    });
});
