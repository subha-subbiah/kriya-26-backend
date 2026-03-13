import { Router } from "express";
import {
  claimActionCard,
  getClaimedCards,
  activateActionCard,
  getUsedCards
} from "../controllers/actionCardController.js";
import { teamAuthMiddleware } from "../middleware/authMiddleware.js";

const router = Router();

// Route 1 — CLAIM ACTION CARD
router.post("/claim/:kriyaID", teamAuthMiddleware, claimActionCard);

// Route 2 — GET CLAIMED ACTION CARDS
router.get("/claimed/:kriyaID", teamAuthMiddleware, getClaimedCards);

// Route 3 — ACTIVATE ACTION CARD
router.post("/activate/:kriyaID", teamAuthMiddleware, activateActionCard);

// Route 4 — GET USED ACTION CARDS
router.get("/used/:kriyaID", teamAuthMiddleware, getUsedCards);

export default router;
