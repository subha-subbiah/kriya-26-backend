import Round1Set from "../models/Round1Set.js";
import Team from "../models/Team.js";

// GET all questions of a team
export const getRound1Questions = async (req, res) => {
  try {
    const { kriyaID } = req.query;

    if (!kriyaID) {
      return res.status(400).json({ msg: "kriyaID is required" });
    }

    // Find team
    const team = await Team.findOne({ kriyaID });

    if (!team) {
      return res.status(404).json({ msg: "Team not found" });
    }

    // Get set number
    const setNo = Number(team.setNo);

    const round1Set = await Round1Set.findOne({ setNo });

    if (!round1Set) {
      return res.status(404).json({
        msg: "Round1 questions not found for this set",
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
    const { kriyaID } = req.query;
    const seaId = Number(req.params.seaId);

    if (!kriyaID) {
      return res.status(400).json({ msg: "kriyaID required" });
    }

    if (!Number.isFinite(seaId)) {
      return res.status(400).json({ msg: "Invalid seaId" });
    }

    // Find team
    const team = await Team.findOne({ kriyaID });

    if (!team) {
      return res.status(404).json({ msg: "Team not found" });
    }

    const setNo = Number(team.setNo);

    const round1Set = await Round1Set.findOne({ setNo });

    if (!round1Set) {
      return res.status(404).json({ msg: "Round1 set not found" });
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

    // Find team
    const team = await Team.findOne({ kriyaID });

    if (!team) {
      return res.status(404).json({ msg: "Team not found" });
    }

    const setNo = Number(team.setNo);

    // Find question set
    const round1Set = await Round1Set.findOne({ setNo });

    if (!round1Set) {
      return res.status(404).json({ msg: "Question set not found" });
    }

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

    if (!team.round1) {
      team.round1 = { selectedScrolls: [], score: 0 };
    }

    if (!team.round1.selectedScrolls) {
      team.round1.selectedScrolls = [];
    }

    const card = question.algorithmCard || null;

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

    const points = question.points || 10;

    team.round1.score += points;
    team.totalScore += points;

    let actionCard = null;

    if (card) {
      const randomQuestionNo = Math.floor(Math.random() * 5);

      team.round1.selectedScrolls.push({
        name: card.name,
        difficultyTag: card.difficultyTag,
        questionNo: randomQuestionNo,
      });
      team.markModified('round1.selectedScrolls');
    }

    await team.save();

    return res.json({
      correct: true,
      earnedPoints: points,
      card: card,
      actionCard: actionCard, // Return the awarded action card
      msg: "Correct answer!",
    });
  } catch (err) {
    res.status(500).json({
      msg: "Error submitting answer",
      error: err.message,
    });
  }
};