// app.js

// npm install express body-parser express-session express-mysql-session express-flash dotenv helmet xss-clean express-rate-limit express-ejs-layouts
const logger = require('./logger');
const express = require('express');
const app = express();
const fs = require('fs');
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
require('dotenv').config();
const path = require('path');
const helpers = require('./helpers');
app.locals.slimDateTime = helpers.slimDateTime;
app.locals.formatCurrency = helpers.formatCurrency;
app.locals.packageJson = require('./package.json');
app.use(express.static(path.join(__dirname, 'public')));
app.use('/node_modules', express.static(path.join(__dirname, 'node_modules')));

app.set('view engine', 'ejs');
app.set('layout', 'layout');

const expressLayouts = require('express-ejs-layouts');
app.use(expressLayouts);

const xss = require('xss-clean');
app.use(xss());

const rateLimit = require('express-rate-limit');
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1500,
});
app.use(limiter);

const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
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
    saveUninitialized: false
}));
sessionStore.onReady().then(() => {
    if (process.env.DEBUG) {
        logger.info('MySQLStore ready');
    }
}).catch(error => {
    logger.error(error);
});

app.use((req, res, next) => {
    res.locals.session = req.session;
    next();
});

const flash = require('express-flash');

app.use(flash());

const helmet = require('helmet');
app.use(helmet());
app.use(
    helmet.contentSecurityPolicy({
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: [
                "'self'",
                "'unsafe-inline'",
                "https://cdn.jsdelivr.net",
                "https://fonts.googleapis.com",
            ],
            scriptSrc: [
                "'self'",
                "'unsafe-inline'",
                "https://cdn.jsdelivr.net",
            ],
            fontSrc: [
                "'self'",
                "'unsafe-inline'",
                "https://cdn.jsdelivr.net",
                "https://fonts.gstatic.com",
                "https://fonts.googleapis.com",
            ],
            imgSrc: [
                "'self'",
                "data:",
                "otpauth:",
                "https://i.creativecommons.org",
                "https://licensebuttons.net",
            ],
            connectSrc: ["'self'"],
        },
    })
);

const { Op } = require("sequelize");

const createDefaultAdmin = async () => {
    try {
        const admin = await User.findOne({
            where: {
                [Op.or]: [
                    { username: 'admin' },
                    { role: 'admin' }
                ]
            }
        });
        if (!admin) {
            await User.create({
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
        logger.error('Error creating default admin:', error);
    }
};

app.use((err, req, res, next) => {
    logger.error(err.stack);
    res.status(500).send('Something broke!');
});

app.use(async (req, res, next) => {
    try {
        res.locals.invoicesWithoutSubmissionDate = await Invoice.findAll({
            where: {
                submissionDate: null
            },
            attributes: ['id', 'kashflowNumber'],
            order: [['kashflowNumber', 'ASC']]
        });
        next();
    } catch (error) {
        logger.error('Error fetching invoices:', error);
        next();
    }
});

const User = require('./models/user');
const Subcontractor = require('./models/subcontractor');
const Invoice = require('./models/invoice');
const Submission = require('./models/submission');
const SubmissionInvoices = require('./models/associations/submissionInvoices');
User.hasMany(Subcontractor, {
    foreignKey: 'userId',
    allowNull: false,
});
Subcontractor.hasMany(Invoice, {
    foreignKey: 'SubcontractorId',
    allowNull: false,
    as: 'invoices'
});
Invoice.belongsTo(Subcontractor, {
    foreignKey: 'SubcontractorId',
    allowNull: false,
});
Submission.belongsToMany(Invoice, {
    through: 'SubmissionInvoices',
    foreignKey: 'submissionId',
    otherKey: 'invoiceId',
});
(async () => {
    try {
        await User.sync();
        await Subcontractor.sync();
        await Invoice.sync();
        await Submission.sync();
        await SubmissionInvoices.sync();
        if (process.env.DEBUG) {
            logger.info('Models synced with the database');
        };
        if (process.env.DEV) {
            await createDefaultAdmin();
        }
    } catch (error) {
        logger.error('Error syncing models:', error);
    }
})();

const renderFunctions = require('./controllers/renderFunctions');

const login = require('./controllers/login');
const register = require('./controllers/register');
const settings = require('./controllers/settings');

const userCRUD = require('./controllers/userCRUD');
const subcontractorCRUD = require('./controllers/subcontractorCRUD');
const invoiceCRUD = require('./controllers/invoiceCRUD');

const monthlyReturns = require('./controllers/monthlyReturns');
const yearlyReturns = require('./controllers/yearlyReturns');

const submission = require('./controllers/submissionCRUD');

app.use('/', renderFunctions);

app.use('/', login);
app.use('/', register);
app.use('/', settings);

app.use('/', userCRUD);
app.use('/', subcontractorCRUD);
app.use('/', invoiceCRUD);

app.use('/', monthlyReturns);
app.use('/', yearlyReturns);

app.use('/', submission);

app.use((err, req, res, next) => {
    logger.error(err.stack);
    const status = err.status || 500;
    const errorViewPath = path.join(__dirname, 'views', `${status}.ejs`);

    // Use a different variable name for the error in fs.access callback
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
});

const port = 3000;
app.listen(port, 'localhost', () => {
    logger.info('Server running at http://localhost:3000');
});
