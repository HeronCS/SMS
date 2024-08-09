const express = require('express');
const https = require('https');
const selfsigned = require('selfsigned');
const app = express();
const path = require('path');
const expressLayouts = require('express-ejs-layouts');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const flash = require('express-flash');
const helmet = require('helmet');
const xss = require('xss-clean');
const rateLimit = require('express-rate-limit');
const logger = require('./logger');
const fs = require('fs');
require('dotenv').config();
const helpers = require('./helpers');

// Generate the self-signed certificate
const attrs = [
    { name: 'commonName', value: process.env.SSL_COMMON_NAME },
    { name: 'countryName', value: process.env.SSL_COUNTRY },
    { shortName: 'ST', value: process.env.SSL_STATE },
    { name: 'localityName', value: process.env.SSL_LOCALITY },
    { name: 'organizationName', value: process.env.SSL_ORGANIZATION },
    { shortName: 'OU', value: process.env.SSL_ORGANIZATIONAL_UNIT }
];

const pems = selfsigned.generate(attrs, { days: 365 });

const options = {
    key: pems.private,
    cert: pems.cert
};

// Set up EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('layout', 'layout'); // default layout
app.use(expressLayouts);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/node_modules', express.static(path.join(__dirname, 'node_modules')));

app.use(xss());
app.use(flash());

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1500,
});
app.use(limiter);

app.use(helmet());
app.use(
    helmet.contentSecurityPolicy({
        directives: {
            defaultSrc: ["'self'", "sms.heroncs.local"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://fonts.googleapis.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
            fontSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://fonts.gstatic.com", "https://fonts.googleapis.com"],
            imgSrc: ["'self'", "data:", "otpauth:", "https://i.creativecommons.org", "https://licensebuttons.net"],
            connectSrc: ["'self'", "sms.heroncs.local"],
        },
    })
);

const sessionStore = new MySQLStore({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    clearExpired: true,
    checkExpirationInterval: 300000,
    expiration: 43200000,
    createDatabaseTable: true,
    endConnectionOnClose: true,
    disableTouch: false,
    charset: 'utf8mb4_bin',
    schema: {
        tableName: 'sessions',
        columnNames: {
            session_id: 'session_id',
            expires: 'expires',
            data: 'data'
        }
    }
});

app.use(session({
    key: 'session_cookie_name',
    secret: process.env.SESSION_SECRET,
    store: sessionStore,
    resave: false,
    saveUninitialized: true,
    cookie: {
        secure: true,
        httpOnly: true,
        maxAge: 43200000, // 12 hours
    }
}));

sessionStore.onReady().then(() => {
    logger.info('MySQLStore ready');
}).catch(error => {
    logger.error(error);
});

app.use((req, res, next) => {
    res.locals.session = req.session;
    logger.info(`Session Data: ${JSON.stringify(req.session)}`);
    const username = req.session.user ? req.session.user.username : 'unknown user';
    const logMessage = `${username} accessed path ${req.method} ${req.path}`;

    if (req.path.includes('/update/')) {
        logger.warn(`-------- Warn: ${logMessage}`);
    } else if (req.path.includes('/delete/')) {
        logger.error(`------- Danger: ${logMessage}`);
    } else {
        logger.info(`${logMessage}`);
    }
    next();
});

const { Op } = require("sequelize");

const createDefaultAdmin = async () => {
    try {
        const admin = await Users.findOne({
            where: {
                [Op.or]: [
                    { username: 'admin' },
                    { role: 'admin' }
                ]
            }
        });
        if (!admin) {
            await Users.create({
                username: process.env.ADMIN_USERNAME,
                email: process.env.ADMIN_EMAIL,
                password: process.env.ADMIN_PASSWORD,
                role: 'admin',
            }, {
                fields: ['username', 'email', 'password', 'role']
            });
            if (process.env.DEBUG) {
                logger.info('Default admin created.');
            }
        } else {
            if (process.env.DEBUG) {
                logger.info('Default admin already exists.');
            }
        }
    } catch (error) {
        logger.error('Error creating default admin: ' + error);
    }
};

const Users = require('./models/user');
const Subcontractors = require('./models/subcontractor');
const Invoices = require('./models/invoice');
const Employees = require('./models/employee');
const Attendances = require('./models/attendance');
const Quotes = require('./models/quote');
const Clients = require('./models/client');
const Contacts = require('./models/contact');

Users.hasMany(Subcontractors, {
    foreignKey: 'userId',
    allowNull: false,
});
Subcontractors.hasMany(Invoices, {
    foreignKey: 'SubcontractorId',
    allowNull: false,
    as: 'invoices'
});
Invoices.belongsTo(Subcontractors, {
    foreignKey: 'SubcontractorId',
    allowNull: false,
});
Employees.hasMany(Attendances, {
    foreignKey: 'employeeId',
    allowNull: false,
});
Subcontractors.hasMany(Attendances, {
    foreignKey: 'subcontractorId',
    allowNull: false,
});
Attendances.belongsTo(Employees, {
    foreignKey: 'employeeId',
    allowNull: false,
});
Attendances.belongsTo(Subcontractors, {
    foreignKey: 'subcontractorId',
    allowNull: false,
});
Clients.hasMany(Quotes, {
    foreignKey: 'clientId',
    allowNull: false,
});
Quotes.belongsTo(Clients, {
    foreignKey: 'clientId',
    allowNull: false,
});
Clients.hasMany(Contacts, {
    foreignKey: 'clientId',
    allowNull: false,
});
Contacts.belongsTo(Clients, {
    foreignKey: 'clientId',
    allowNull: false,
});

(async () => {
    try {
        if (process.env.NODE_ENV === 'development') {
            await Users.sync({ alter: true });
            await Subcontractors.sync({ alter: true });
            await Invoices.sync({ alter: true });
            await Employees.sync({ alter: true });
            await Attendances.sync({ alter: true });
            await Clients.sync({ alter: true });
            await Quotes.sync({ alter: true });
            await Contacts.sync({ alter: true });
        }
        if (process.env.DEBUG) {
            logger.info('Models synced with the database');
        };
        if (process.env.DEV) {
            await createDefaultAdmin();
        }
        if (process.env.NODE_ENV === 'production') {
            await Users.sync({ alter: false });
            await Subcontractors.sync({ alter: false });
            await Invoices.sync({ alter: false });
            await Employees.sync({ alter: false });
            await Attendances.sync({ alter: false });
            await Clients.sync({ alter: false });
            await Quotes.sync({ alter: false });
            await Contacts.sync({ alter: false });
        }
    } catch (error) {
        logger.error('Error syncing models:', error);
    }
})();

app.use(async (req, res, next) => {
    try {
        res.locals.invoicesWithoutSubmissionDate = await Invoices.findAll({
            where: {
                submissionDate: null
            },
            attributes: ['id', 'kashflowNumber'],
            order: [['kashflowNumber', 'ASC']]
        });
        next();
    } catch (error) {
        logger.error('Error fetching invoices without submission date: ' + error);
        next();
    }
});

app.use(async (req, res, next) => {
    try {
        if (!req.session) {
            
        }
        const unpaidInvoices = await Invoices.findAll({
            where: { remittanceDate: null },
            attributes: ['id', 'kashflowNumber'],
            order: [['kashflowNumber', 'ASC']]
        });

        const unsubmittedInvoices = await Invoices.findAll({
            where: { submissionDate: null },
            attributes: ['id', 'kashflowNumber'],
            order: [['kashflowNumber', 'ASC']]
        });

        res.locals.unpaidInvoices = unpaidInvoices;
        res.locals.unsubmittedInvoices = unsubmittedInvoices;
        res.locals.totalNotifications = unpaidInvoices.length + unsubmittedInvoices.length;

        next();
    } catch (error) {
        logger.error('Error fetching invoices: ' + error);
        next();
    }
});

const render = require('./controllers/renderForms');

const formsClient = require('./controllers/forms/client');
const formsContact = require('./controllers/forms/contact');
const formsError = require('./controllers/forms/error');
const formsInvoice = require('./controllers/forms/invoice');
const formsQuote = require('./controllers/forms/quote');
const formsSubcontractor = require('./controllers/forms/subcontractor');
const formsUser = require('./controllers/forms/user');

const renderDashboard = require('./controllers/renderDashboards');

const userLogin = require('./controllers/user/login');
const userRegister = require('./controllers/user/register');
const userSettings = require('./controllers/user/settings');

const userCRUD = require('./controllers/CRUD/userCRUD');
const subcontractorCRUD = require('./controllers/CRUD/subcontractorCRUD');
const invoiceCRUD = require('./controllers/CRUD/invoiceCRUD');
const quoteCRUD = require('./controllers/CRUD/quoteCRUD');
const clientCRUD = require('./controllers/CRUD/clientCRUD');
const contactCRUD = require('./controllers/CRUD/contactCRUD');
// const attendanceCRUD = require('./controllers/CRUD/attendanceCRUD');
// const employeeCRUD = require('./controllers/CRUD/employeeCRUD');

const monthlyReturns = require('./controllers/monthlyReturns');
const yearlyReturns = require('./controllers/yearlyReturns');

app.use('/', render);

app.use('/', formsClient);
app.use('/', formsContact);
app.use('/', formsError);
app.use('/', formsInvoice);
app.use('/', formsQuote);
app.use('/', formsSubcontractor);
app.use('/', formsUser);

app.use('/', renderDashboard);

app.use('/', userLogin);
app.use('/', userRegister);
app.use('/', userSettings);

app.use('/', userCRUD);
app.use('/', subcontractorCRUD);
app.use('/', invoiceCRUD);
app.use('/', quoteCRUD);
app.use('/', clientCRUD);
app.use('/', contactCRUD);
// app.use('/', attendanceCRUD);
// app.use('/', employeeCRUD);

app.use('/', monthlyReturns);
app.use('/', yearlyReturns);

// Error handling middleware
const errorHandler = (err, req, res, next) => {
    logger.error(err.stack);
    const status = err.status || 500;
    const errorViewPath = path.join(__dirname, 'views', `${status}.ejs`);

    fs.access(errorViewPath, fs.constants.F_OK, (fsErr) => {
        if (fsErr) {
            res.status(status).render('error', {
                message: err.message,
                error: err
            });
        } else {
            res.status(status).render(String(status), {
                message: err.message,
                error: err
            });
        }
    });
};

app.use(errorHandler);

app.listen(80, '0.0.0.0', () => {
    logger.info(`Server is running`);
});