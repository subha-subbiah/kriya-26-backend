import { Router } from "express";
import { authMiddleware, teamAuthMiddleware } from "../middleware/authMiddleware.js";
import {
    createSubmission,
    openProblem,
    getByTeam,
    getByProblem,
    updateSubmission,
    deleteSubmission
} from "../controllers/round2SubmissionController.js";

const router = Router();

router.post("/open", teamAuthMiddleware, openProblem);
router.post("/", teamAuthMiddleware, createSubmission);
router.get("/team/:id", authMiddleware, getByTeam);
router.get("/problem/:id", authMiddleware, getByProblem);
router.put("/:id", authMiddleware, updateSubmission);
router.delete("/:id", authMiddleware, deleteSubmission);

export default router;
