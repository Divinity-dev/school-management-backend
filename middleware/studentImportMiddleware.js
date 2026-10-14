
import multer from "multer";

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const allowedExtensions = /\.(xlsx|xls|csv)$/i;

    if (!allowedExtensions.test(file.originalname)) {
      return cb(
        new Error("Choose an Excel (.xlsx, .xls) or CSV (.csv) file.")
      );
    }

    cb(null, true);
  },
});

export default upload;
