const {Client, MessageMedia} = require('whatsapp-web.js');
const express = require('express');
const {body, validationResult} = require('express-validator');
const socketIO = require('socket.io');
const qrcode = require('qrcode');
const http = require('http');
const fs = require('fs');
const {phoneNumberFormatter} = require('./helpers/formatter');
// const fileUpload = require('express-fileupload');
const axios = require('axios');
const port = process.env.PORT || 8000;

const app = express();
const server = http.createServer(app);
const io = socketIO(server);


const cors = require('cors');


app.use(cors());

app.use(express.json({limit: '50mb'}));
app.use(express.urlencoded({extended: true, limit: '50mb'}));
// app.use(fileUpload({debug: true}));

const SESSION_FILE_PATH = './whatsapp-session.json';
let sessionCfg;
if (fs.existsSync(SESSION_FILE_PATH)) {
    sessionCfg = require(SESSION_FILE_PATH);
}

app.get('/', (req, res) => {
    res.sendFile('index.html', {root: __dirname});
});

const client = new Client({
    restartOnAuthFail: true,
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process', // <- this one doesn't works in Windows
            '--disable-gpu'
        ]
    },
    session: sessionCfg
});

client.on('message', msg => {
    if (msg.body == '!ping') {
        msg.reply('pong');
    } else if (msg.body == 'good morning') {
        msg.reply('selamat pagi');
    } else if (msg.body == '!groups') {
        client.getChats().then(chats => {
            const groups = chats.filter(chat => chat.isGroup);

            if (groups.length == 0) {
                msg.reply('You have no group yet.');
            } else {
                let replyMsg = '*YOUR GROUPS*\n\n';
                groups.forEach((group, i) => {
                    replyMsg += `ID: ${
                        group.id._serialized
                    }\nName: ${
                        group.name
                    }\n\n`;
                });
                replyMsg += '_You can use the group id to send a message to the group._'
                // msg.reply(replyMsg);
            }
        });
    }
});

client.initialize();

// Socket IO
io.on('connection', function (socket) {
    socket.emit('message', 'Connecting...');

    client.on('qr', (qr) => {
        console.log('QR RECEIVED', qr);
        qrcode.toDataURL(qr, (err, url) => {
            socket.emit('qr', url);
            socket.emit('message', 'QR Code received, scan please!');
        });
    });

    client.on('ready', () => {
        socket.emit('ready', 'Whatsapp is ready!');
        socket.emit('message', 'Whatsapp is ready!');
    });

    client.on('authenticated', (session) => {
        socket.emit('authenticated', 'Whatsapp is authenticated!');
        socket.emit('message', 'Whatsapp is authenticated!');
        console.log('AUTHENTICATED', session);
        sessionCfg = session;
        fs.writeFile(SESSION_FILE_PATH, JSON.stringify(session), function (err) {
            if (err) {
                console.error(err);
            }
        });
    });

    client.on('auth_failure', function (session) {
        socket.emit('message', 'Auth failure, restarting...');
    });

    client.on('disconnected', (reason) => {
        socket.emit('message', 'Whatsapp is disconnected!');
        fs.unlinkSync(SESSION_FILE_PATH, function (err) {
            if (err) 
                return console.log(err);
            


            console.log('Session file deleted!');
        });
        client.destroy();
        client.initialize();
    });
});


// const checkRegisteredNumber = async function(number) {
// const isRegistered = await client.isRegisteredUser(number);
// return isRegistered;
// }


app.post('/logout', (req, res) => {
    fs.unlinkSync(SESSION_FILE_PATH, function (err) {
        if (err) 
            return console.log(err);
        console.log('Session file deleted!');
    });
    client.destroy();
    client.initialize();
});
// Send message
app.post('/send-message', (req, res) => { // const number = phoneNumberFormatter(req.body.number);
    const number = req.body.number;
    const message = req.body.message;

    // const isRegisteredNumber = await checkRegisteredNumber(number);

    // if (!isRegisteredNumber) {
    // return res.status(422).json({
    //     status: false,
    //     message: 'The number is not registered'
    // });
    // }

    client.sendMessage(number, message).then(response => {
        res.status(200).json({status: true, response: response});
    }).catch(err => {
        res.status(500).json({status: false, response: err});
    });
});


// kirim pesan ke group
app.post('/send-message-group', async (req, res) => {
    // console.log(req.body)

    // var chatId = req.body.group.[0].id._serialized;
    var caption = req.body.caption;
    var time = req.body.time;
    // var fileUrl = req.body.url_media;//'https://i.imgur.com/xrob8fB.jpg';


    // // const media = MessageMedia.fromFilePath('./image-example.png');
    const files = req.body.file;
    // // console.log(file)
    // const base64Content = file.dataURL;
    // // console.log(base64Content)
    // // base64 encoded data doesn't contain commas
    // let base64ContentArray = base64Content.toString().split(",")

    // // base64 content cannot contain whitespaces but nevertheless skip if there are!
    // let mimeType = base64ContentArray[0].match(/[^:]\w+\/[\w-+\d.]+(?=;|,)/)[0];

    // // base64 encoded data - pure
    // let base64Data = base64ContentArray[1]
    // const media = new MessageMedia(mimeType, base64Data, file.upload.filename);
    // let mimetype;
    // const attachment = await axios.get(fileUrl, {responseType: 'arraybuffer'}).then(response => {
    //     mimetype = response.headers['content-type'];
    //     return response.data.toString('base64');
    // });

    // const media = new MessageMedia(mimetype, attachment, 'Media');

    const groups = req.body.group

    function wait(milleseconds) {
        return new Promise(resolve => setTimeout(resolve, milleseconds))
    }

    async function send(groups) {
        for (file of files) {

            // const media = MessageMedia.fromFilePath('./image-example.png');

            // console.log(file)
            const base64Content = file.dataURL;
            
            // console.log(base64Content)
            // base64 encoded data doesn't contain commas
            let base64ContentArray = base64Content.toString().split(",")

            // base64 content cannot contain whitespaces but nevertheless skip if there are!
            let mimeType = base64ContentArray[0].match(/[^:]\w+\/[\w-+\d.]+(?=;|,)/)[0];

            // base64 encoded data - pure
            let base64Data = base64ContentArray[1]
            const media = new MessageMedia(mimeType, base64Data, file.upload.filename);
            for (item of groups) {
                await wait(time)
                console.log('uploading '+file.caption.toUpperCase()+' to group >>>> '+ item.name);
                client.sendMessage(item.id._serialized, media, {caption: file.caption.toUpperCase()}).then(response => {
                    
                }).catch(err => {
                    // res.status(500).json({status: false, response: err});
                });
                console.log('done upload to group >>>> '+ item.name);
            }
        }
        console.log('All clear => done')
        res.status(200).json({status: true, response: 'true'});
    }
    send(groups, files,time)
  

});


// get group id
app.get('/get-group-id', (req, res) => {
    // res.header("Access-Control-Allow-Origin", "*");
    // const number = req.body.number;
    var replyMsg = [];
    // var replyMsg = "";
    client.getChats().then(chats => {
        const groups = chats.filter(chat => chat.isGroup);
        var group_data = null;

        if (groups.length == 0) {
            msg.reply('You have no group yet.');
        } else {

            groups.forEach((group, i) => { // replyMsg += `ID: ${group.id._serialized}\nName: ${group.name}\n\n`;
                replyMsg.push(group);

                // client.sendMessage(number, replyMsg).then(response => {
                // res.status(200).json({
                //     status: true,
                //     response: response
                // });
                // }).catch(err => {
                // res.status(500).json({
                //     status: false,
                //     response: err
                // });
                // });

                // groupData.push({'id':group.id._serialized,'name':group.name})

            });
            // replyMsg += '_You can use the group id to send a message to the group._'

            // msg.reply(replyMsg);
            res.json({group: replyMsg})
        }
    });

});


// Send media
app.post('/send-media', async (req, res) => {
    const number = phoneNumberFormatter(req.body.number);
    const caption = req.body.caption;
    const fileUrl = req.body.file;

    // const media = MessageMedia.fromFilePath('./image-example.png');
    const file = req.files.file;
    const media = new MessageMedia(file.mimetype, file.data.toString('base64'), file.name);
    // let mimetype;
    // const attachment = await axios.get(fileUrl, {responseType: 'arraybuffer'}).then(response => {
    //     mimetype = response.headers['content-type'];
    //     return response.data.toString('base64');
    // });

    // const media = new MessageMedia(mimetype, attachment, 'Media');

    client.sendMessage(number, media, {caption: caption}).then(response => {
        res.status(200).json({status: false, response: response});
    }).catch(err => {
        res.status(500).json({status: false, response: err});
    });
});

// Send message to group
// -- Send message !groups to get all groups (id & name)
// -- So you can use that group id to send a message
app.post('/send-group-message', [
    body('id').notEmpty(), body('message').notEmpty(),
], async (req, res) => {
    const errors = validationResult(req).formatWith(({msg}) => {
        return msg;
    });

    if (! errors.isEmpty()) {
        return res.status(422).json({status: false, message: errors.mapped()});
    }

    const chatId = req.body.id;
    const message = req.body.message;

    client.sendMessage(chatId, message).then(response => {
        res.status(200).json({status: true, response: response});
    }).catch(err => {
        res.status(500).json({status: false, response: err});
    });
});


// Send media
app.post('/send-media-group', async (req, res) => {
    const chatId = req.body.id;
    const caption = req.body.caption;
    const fileUrl = req.body.file;

    // const media = MessageMedia.fromFilePath('./image-example.png');
    const file = req.files.file;
    const media = new MessageMedia(file.mimetype, file.data.toString('base64'), file.name);
    // let mimetype;
    // const attachment = await axios.get(fileUrl, {responseType: 'arraybuffer'}).then(response => {
    //     mimetype = response.headers['content-type'];
    //     return response.data.toString('base64');
    // });

    // const media = new MessageMedia(mimetype, attachment, 'Media');

    client.sendMessage(chatId, media, {caption: caption}).then(response => {
        res.status(200).json({status: true, response: response});
    }).catch(err => {
        res.status(500).json({status: false, response: err});
    });
});


app.use(function (req, res, next) { // Website you wish to allow to connect
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Request methods you wish to allow
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');

    // Request headers you wish to allow
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');

    // Set to true if you need the website to include cookies in the requests sent
    // to the API (e.g. in case you use sessions)
    res.setHeader('Access-Control-Allow-Credentials', true);

    // Pass to next layer of middleware
    next();
});


server.listen(port, function () {
    console.log('App running on *: ' + port);
});
