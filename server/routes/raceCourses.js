// Route files for race plans (docs/plans/race-plan.md):
//   POST /api/race-courses — multipart, field `file` (GPX or FIT). Reads the
//   file into a stored course and answers what the coach is then told about
//   it; the app attaches that to the rider's next coach message, and the
//   coach's plan_race tool plans it (services/racePlans.js).
const express = require('express');
const multer = require('multer');
const router = express.Router();
const { patchAsyncRoutes } = require('../lib/asyncRoutes');
const { authMiddleware } = require('../middleware/auth');
const { contract: c } = require('@bikelab/shared/api');
const { contract } = require('../middleware/contract');
const racePlans = require('../services/racePlans');
patchAsyncRoutes(router);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: racePlans.MAX_FILE_BYTES, files: 1 } });

router.post('/', authMiddleware, upload.single('file'), contract(c.raceCourses.upload), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Attach a GPX or FIT file as "file"', code: 'BAD_REQUEST' });
  try {
    res.json(await racePlans.createCourse(req.user.userId, { buffer: req.file.buffer, filename: req.file.originalname }));
  } catch (err) {
    if (err instanceof racePlans.CourseFileError) {
      return res.status(400).json({ error: err.message, code: `COURSE_${err.code.toUpperCase()}` });
    }
    throw err;
  }
});

module.exports = router;
