import express from "express";
import {
  getRound1Questions,
  getRound1QuestionBySea,
  submitRound1Answer,
} from "../controllers/round1Controller.js";

const router = express.Router();

router.get("/questions", getRound1Questions);
router.get("/questions/:seaId", getRound1QuestionBySea);
router.post("/submit", submitRound1Answer);

export default router;