import express from "express";
import bodyParser from "body-parser";
import { dirname } from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import dotenv from "dotenv";
import _ from "lodash";


// Load and check env.
loadAndCheckEnv();

/* Set dirname prefix for the current root so that files can be served.
 * e.g res.sendFile(_dirname + '/web/index.html'); */
const _dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT = "to-do-list-app";
const app = express();
const PORT = 3000;
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
  console.log('connectToMongo(): Connecting to mongo');

  try {
    await mongoose.connect(`${process.env.SECRET_MONGO_URI}/${PROJECT}`);
    console.log('connectToMongo(): Connected to mongo');

  } catch (err) {
    console.error(`ERROR: connectToMongo(): ${err}`);
  }
}


/** Render index.ejs html file with required  task list.
  * @param {res} app response handler.
  * @param {string} name name of the list to render.
*/
async function renderList(res, name) {
  // Convert task list name to Capitalized case.
  const listName = _.capitalize(name);

  try {
    const query = {
      listName: listName
    };

    // https://mongoosejs.com/docs/api/model.html#Model.find()
    const listData = await TaskModel.find(query).sort({ "done": 1, "text": 1 }).exec();
    const list = {
      listName: listName,
      tasks: listData
    };
    res.render('index.ejs', list);
  } catch (err) {
    console.error(`ERROR: renderList(): ${err}`);
  }
}


/* Handle GET requests to '/' 
 * - Redirect to 'Personal' task list.*/
app.get('/',
  (req, res) => {
    console.log('GET: "/"', req.body);
    res.redirect('/Personal');
  }
);


/* Handle REST-ful (GET and POST) requests to '/:listName'
 * - GET Render page for requested listName.
 * - POST Add task to requested listName and then redirect to the task list.
*/
app.route('/:listName')
  .get(
    (req, res) => {
      console.log(`GET: "/${req.params.listName}"`, req.body);

      // Render page for requested listName
      const listName = req.params.listName ? req.params.listName : 'Personal';
      renderList(res, listName);
    }
  )
  .post(
    async function (req, res) {
      console.log(`POST: "/${req.params.listName}"`, req.body);
      const listName = _.capitalize(req.params.listName);

      /* NOTE: HTML has no way to send a "DELETE" method.
       *  so we check here for an _method === "delete"
      */

      // Handle DELETE...
      if (req.body._method === "delete") {
        console.log("delete");
        await deleteList(listName);
        res.redirect(`/`);
        return;
      }

      // Handle PRUNE...
      if (req.body._method === "prune") {
        console.log("prune");
        await pruneList(listName);
        res.redirect(listName);
        return;
      }

      // Handle all other POST requests...
      await TaskModel(
        {
          listName: req.params.listName,
          text: req.body.newItem,
          done: false
        }
      ).save();

      // Redirect back to the list.
      res.redirect(listName);
    }
  )
  .delete(
    // NOTE: HTML has no way to send a "DELETE" method so look at POST for details.
    async function (req, res) {
      console.error(`DELETE: "/${req.params.listName}"`, req.body);
    }
  );


/** Delete a list.
  * @param {string} name name of the list to delete.
*/
async function deleteList(name) {
  console.log("deleteList()", name);

  // Ignore if the listName is "Personal"
  if (name === "Personal") {
    console.error("ERROR: Cannot delete Personal task list");
    return;
  }

  // Find all documents in the required list and delete them.
  await TaskModel.deleteMany({
    listName: name
  }).exec();
}


/** Prune a list.
  * @param {string} name name of the list to prune.
*/
async function pruneList(name) {
  console.log("pruneList()", name);

  // Find all documents in the required list with "done" and delete them.
  TaskModel.deleteMany({
    listName: name,
    done: true
  }).exec();
}


/* Handle POST requests to '/:listName/:_id/done'
 * Find document and update the "done" field.
 * - Redirect back to the list.
*/
app.post('/:listName/:_id/done',
  async function (req, res) {
    console.log(`POST: "/${req.params.listName}/${req.params._id}/done"`);

    // Find document and update the "done" field.
    const done = req.body?.done === 'on' ? true : false;
    await TaskModel.findByIdAndUpdate(req.params._id, { done: done }).exec();
    // Redirect back to the list.
    res.redirect(`/${req.params.listName}`);
  }
);


/** Load and check env.
  * - If SECRET_MONGO_URI is not set...
  * - - Assume we are in dev mode and try to load it from .env file
  * - Check for Mongo Uri and exit if not found.
*/
function loadAndCheckEnv() {
  console.log('=========================');

  // If SECRET_MONGO_URI is not set...
  if (!process.env.SECRET_MONGO_URI) {
    // Assume we are in dev mode and try to load it from .env file
    console.log('= RUNNING LOCALLY');
    dotenv.config();
  } else {
    console.log('= RUNNING PRODUCTION');
  }

  console.log('=========================');

  // Check for Mongo Uri and exit if not found.
  if (!process.env.SECRET_MONGO_URI) {
    console.error('ERROR: Unable to load Mongo uri.');
    process.exit(5);
  }
}

//////////////////////////////////////////////////////////////////////////////////////////////
// 

// Connect to mongo database.
connectToMongo();

// Start the app, listening on PORT "PORT".
app.listen(PORT,
  () => {
    console.log(`PROJECT "${PROJECT}": Server is running on port ${PORT}`);
  }
);
