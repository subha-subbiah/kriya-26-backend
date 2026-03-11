import Round1Set from "../models/Round1Set.js";
import Team from "../models/Team.js";
// GET all questions of one team
export const getRound1Questions = async (req, res) => {
  try {
    const team = req.query.team || "KRIYA2026";

    const round1Set = await Round1Set.findOne({ team });

    if (!round1Set) {
      return res.status(404).json({
        msg: "Round 1 questions not found for this team",
      });
    }

    res.json(round1Set.questions);
  } catch (err) {
    res.status(500).json({
      msg: "Error fetching Round1 questions",
      error: err.message,
    });
  }
};

// GET one question by sea number
export const getRound1QuestionBySea = async (req, res) => {
  try {
    const team = req.query.team || "KRIYA2026";
    const seaId = Number(req.params.seaId);

    if (!Number.isFinite(seaId)) {
      return res.status(400).json({ msg: "Invalid seaId" });
    }

    const round1Set = await Round1Set.findOne({ team });

    if (!round1Set) {
      return res.status(404).json({ msg: "Round 1 set not found" });
    }

    const question = round1Set.questions.find(
      (q) => Number(q.questionNo) === seaId
    );

    if (!question) {
      return res
        .status(404)
        .json({ msg: `Question for sea ${seaId} not found` });
    }

    res.json(question);
  } catch (err) {
    res.status(500).json({
      msg: "Error fetching Round1 question",
      error: err.message,
    });
  }
};

// POST submit answer
export const submitRound1Answer = async (req, res) => {
  try {
    const { kriyaID, seaId, answer } = req.body;

    if (!kriyaID || !seaId || !answer) {
      return res.status(400).json({
        msg: "kriyaID, seaId and answer are required",
      });
    }

    // Find question set
    const round1Set = await Round1Set.findOne({ team: kriyaID });

    if (!round1Set) {
      return res.status(404).json({ msg: "Team questions not found" });
    }

    // Find the question for the sea
    const question = round1Set.questions.find(
      (q) => Number(q.questionNo) === Number(seaId)
    );

    if (!question) {
      return res.status(404).json({ msg: "Question not found" });
    }

    const userAnswer = String(answer).trim().toUpperCase();
    const correctAnswer = String(question.answer).trim().toUpperCase();

    if (userAnswer !== correctAnswer) {
      return res.json({
        correct: false,
        msg: "Wrong answer!",
      });
    }

    // Find Team
    const team = await Team.findOne({ kriyaID });

    if (!team) {
      return res.status(404).json({ msg: "Team not found" });
    }

    const card = question.algorithmCard || null;

    // Prevent duplicate solving
    const alreadyUnlocked = team.round1.selectedScrolls.some(
      (scroll) => scroll.name === card?.name
    );

    if (alreadyUnlocked) {
      return res.json({
        correct: true,
        earnedPoints: 0,
        card: card,
        msg: "Already solved this sea!",
      });
    }

    // Update scores
    const points = question.points || 10;

    team.round1.score += points;
    team.totalScore += points;

    // Save unlocked algorithm card
    if (card) {
      team.round1.selectedScrolls.push({
        name: card.name,
        difficultyTag: card.difficultyTag,
      });
    }

    await team.save();

    return res.json({
      correct: true,
      earnedPoints: points,
      card: card,
      msg: "Correct answer!",
    });

  } catch (err) {
    res.status(500).json({
      msg: "Error submitting answer",
      error: err.message,
    });
  }
};