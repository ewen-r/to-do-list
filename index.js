import express from "express";
import bodyParser from "body-parser";
import { dirname } from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";



/* Set dirname prefix for the current root so that files can be served.
 * e.g res.sendFile(_dirname + '/web/index.html'); */
const _dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT = "to-do-list-app";
const app = express();
const PORT = 3000;

// Mongo db configuration
const mongoDbUri = `mongodb://127.0.0.1/${PROJECT}`;
const Schema = mongoose.Schema;
const ObjectId = Schema.ObjectId;

const mySchema = new Schema({
  id: ObjectId,
  listName: String,   // Name (or ID?) of the task list that this to-do item belongs to.
  text: String,       // The text of the to-do item
  done: Boolean       // Set to true if the to-do item is done.
});

// mongoose model for the database.. Used to perform db operations.
const TaskModel = mongoose.model('Task', mySchema);


// Link static files.
app.use(express.static('public'));
// Use body-parser middleware to make handling the request body easier.
app.use(bodyParser.urlencoded({ extended: true }));

// Connect to MongoDB database
async function connectToMongo() {
  console.log(`connectToMongo(): Connecting to ${mongoDbUri}`);

  try {
    await mongoose.connect(mongoDbUri);
    console.log(`connectToMongo(): Connected to ${mongoDbUri}`);

  } catch (err) {
    console.error(`ERROR: connectToMongo(): ${err}`);
  }
}


/** Render index.ejs html file with required  task list.
  * @param {res} app response handler.
  * @param {string} name name of the list to render.
*/
async function renderList(res, name) {
  const query = {
    listName: name
  };
  try {
    // https://mongoosejs.com/docs/api/model.html#Model.find()
    const listData = await TaskModel.find(query).sort({ "done": 1, "text": 1 }).exec();
    const list = {
      listName: name,
      tasks: listData
    };
    res.render('index.ejs', list);
  } catch (err) {
    console.error(`ERROR: renderList(): ${err}`);
  }
}


/* Handle GET requests to '/' */
app.get('/',
  (req, res) => {
    console.log('GET: "/"', req.body);
    // Redirect to Personal task list.
    res.redirect('/Personal');
  });


/* Handle GET requests to '/Personal' */
app.get('/Personal',
  (req, res) => {
    console.log('GET: "/Personal"', req.body);
    renderList(res, "Personal");
  });


/* Handle GET requests to '/Work' */
app.get('/Work', (req, res) => {
  console.log('GET: "/Work"', req.body);
  renderList(res, "Work");
});


/* Handle GET requests to '/Miscellaneous' */
app.get('/Miscellaneous',
  (req, res) => {
    console.log('GET: "/Miscellaneous"', req.body);
    renderList(res, "Miscellaneous");
  });


// Handle POST requests to '/'
app.post('/',
  (req, res) => {
    console.log('POST: "/"', req.body);

    TaskModel(
      {
        listName: req.body.listName,
        text: req.body.newItem,
        done: false
      }
    ).save();

    // Redirect back to the list.
    res.redirect(`/${req.body.listName}`);
  }
);


// Handle POST requests to '/done'
app.post('/done/:listName/:_id',
  (req, res) => {
    console.log('POST: "/done"', req.params, req.body);

    // Find document and update the "done" field.
    const done = req.body?.done === 'on' ? true : false;
    TaskModel.findByIdAndUpdate(req.params._id, { done: done }).exec();
    // Redirect back to the list.
    res.redirect(`/${req.params.listName}`);
  }
);


// Handle POST requests to '/prune'
app.post('/prune',
  (req, res) => {
    console.log('POST: "/prune"', req.params, req.body);

    // Find all documents with "done" and delete them.
    TaskModel.deleteMany({ done: true }).exec();

    // Redirect back to the list.
    res.redirect(`/${req.body.listName}`);
  }
);
//////////////////////////////////////////////////////////////////////////////////////////////

// Connect to mongo database.
connectToMongo();

// Start the app, listening on PORT "PORT".
app.listen(PORT,
  () => {
    console.log(`PROJECT "${PROJECT}": Server is running on http://localhost:${PORT}`);
  }
);
