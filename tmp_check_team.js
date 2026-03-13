import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const teamSchema = new mongoose.Schema({
  kriyaID: String,
  regMail: String,
});

const Team = mongoose.model("Team", teamSchema);

async function check() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to DB");

    const team = await Team.findOne({ kriyaID: "KRIYA207" });
    if (team) {
      console.log("Team found:");
      console.log("Kriya ID:", team.kriyaID);
      console.log("Registered Email:", team.regMail);
    } else {
      console.log("Team KRIYA207 NOT found");
      const allTeams = await Team.find({}, { kriyaID: 1, regMail: 1 }).limit(10);
      console.log("Sample teams in DB:", allTeams);
    }
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

check();
