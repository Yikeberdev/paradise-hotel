const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { randomUploadName } = require('./security');

const idCardsDir = path.join(__dirname, '..', 'uploads', 'id_cards');
const receiptsDir = path.join(__dirname, '..', 'uploads', 'receipts');
const desksDir = path.join(__dirname, '..', 'uploads', 'desks');
const roomsDir = path.join(__dirname, '..', 'uploads', 'rooms');
const foodsDir = path.join(__dirname, '..', 'uploads', 'foods');

[idCardsDir, receiptsDir, desksDir, roomsDir, foodsDir].forEach((dir) => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

const createStorage = (targetDir, prefix) => multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, targetDir);
    },
    filename: (req, file, cb) => {
        let ext = path.extname(file.originalname).toLowerCase();
        if (!ext || ext.length > 6) {
            if (file.mimetype === 'application/pdf') ext = '.pdf';
            else if (file.mimetype === 'image/png') ext = '.png';
            else if (file.mimetype === 'image/webp') ext = '.webp';
            else ext = '.jpg';
        }
        // Only allow safe image/pdf extensions
        if (!['.jpg', '.jpeg', '.png', '.webp', '.pdf'].includes(ext)) {
            ext = '.jpg';
        }
        cb(null, randomUploadName(prefix, ext));
    }
});

const allowedMimeTypes = [
    'image/jpeg',
    'image/png',
    'image/jpg',
    'image/webp',
    'application/pdf'
];

const imageOnlyTypes = [
    'image/jpeg',
    'image/png',
    'image/jpg',
    'image/webp',
];

const fileFilter = (req, file, cb) => {
    if (allowedMimeTypes.includes(file.mimetype.toLowerCase())) {
        cb(null, true);
    } else {
        cb(new Error('Only JPG, JPEG, PNG, WEBP, and PDF files are allowed.'));
    }
};

const imageFilter = (req, file, cb) => {
    if (imageOnlyTypes.includes(file.mimetype.toLowerCase())) {
        cb(null, true);
    } else {
        cb(new Error('Only JPG, JPEG, PNG, and WEBP images are allowed.'));
    }
};

const uploadIdCard = multer({
    storage: createStorage(idCardsDir, 'id'),
    fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 }
});

/** Front + back of ID (camera or file) */
const uploadIdCardFields = uploadIdCard.fields([
    { name: 'idCardFront', maxCount: 1 },
    { name: 'idCardBack', maxCount: 1 },
    { name: 'idCard', maxCount: 1 }, // legacy single upload
]);

const uploadReceipt = multer({
    storage: createStorage(receiptsDir, 'receipt'),
    fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 }
});

const uploadDeskImage = multer({
    storage: createStorage(desksDir, 'desk'),
    fileFilter: imageFilter,
    limits: { fileSize: 5 * 1024 * 1024 }
});

const uploadRoomImage = multer({
    storage: createStorage(roomsDir, 'room'),
    fileFilter: imageFilter,
    limits: { fileSize: 5 * 1024 * 1024 }
});

const uploadFoodImage = multer({
    storage: createStorage(foodsDir, 'food'),
    fileFilter: imageFilter,
    limits: { fileSize: 5 * 1024 * 1024 }
});

module.exports = uploadIdCard;
module.exports.uploadIdCard = uploadIdCard;
module.exports.uploadIdCardFields = uploadIdCardFields;
module.exports.uploadReceipt = uploadReceipt;
module.exports.uploadDeskImage = uploadDeskImage;
module.exports.uploadRoomImage = uploadRoomImage;
module.exports.uploadFoodImage = uploadFoodImage;
