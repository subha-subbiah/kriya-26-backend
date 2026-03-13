const mongoose = require('mongoose');
require('dotenv').config();

const checkDB = async () => {
  try {
    console.log('Connecting to:', process.env.MONGO_URI);
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected!');
    
    // Check collections
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log('Collections:', collections.map(c => c.name));
    
    // Check Algorithms
    const Algorithm = mongoose.model('Algorithm', new mongoose.Schema({ name: String }, { strict: false }), 'algorithms');
    const algos = await Algorithm.find();
    console.log('Algorithms found:', algos.length);
    algos.forEach(a => console.log(`- ${a.name} (${a._id})`));
    
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
};

checkDB();
