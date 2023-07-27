import express from "express";
import bodyParser from "body-parser";
import { dirname } from "path";
import { fileURLToPath } from "url";

/* Set dirname prefix for the current root so that files can be served.
 * e.g res.sendFile(_dirname + '/web/index.html'); */
const _dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT = "to-do-list-app";
const app = express();
const PORT = 3000;

// Link static files.
app.use(express.static('public'));
// Use body-parser middleware to make handling the request body easier.
app.use(bodyParser.urlencoded({ extended: true }));


// Defines the interface for a task.
class Task {
  constructor(done, text) {
    this.done = done;
    this.text = text;
  }

  markDone() {
    this.done = true;
  }

  markTodo() {
    this.done = false;
  }
}

// Defines the interface for a task list.
class TaskList {
  constructor(name, tasks) {
    // Name of the list.
    this.listName = name;
    // Array of tasks.
    this.tasks = tasks;
  }

  clearAllTasks() {
    this.tasks = [];
  }

  markAllTasksDone() {
    this.tasks.forEach(
      t => { t.markDone(); }
    );
  }
};


const workTasks = new TaskList(
  "Work",
  [
    new Task(false, "Learn EJS."),
    new Task(true, "Finish the TODO project"),
    new Task(false, "do a thing")
  ]
);

const personalTasks = new TaskList(
  "Personal",
  [
    new Task(false, "Take out the rubbish bin."),
    new Task(true, "Feed the dog")
  ]
);

const miscTasks = new TaskList(
  "Miscellaneous",
  [
    { done: false, text: "My first Miscellaneous task" }
  ]
);


/** All the user's available task lists. */
const lists = [
  workTasks,
  personalTasks,
  miscTasks
];


/** Get list by name.
  * @param {string} name Name of list to find.
  * @returns {TaskList} The required list or undefined if not found.
*/
function getList(name) {
  return lists.find(
    l => (l.listName === name)
  );
}


/** Render index.ejs html file with required  task list.
  * @param {res} app response handler.
  * @param {string} name name of the list to render.
*/
function renderList(res, name) {
  const list = getList(name);
  // @TODO_EWEN What to do if list is undefined.
  res.render('index.ejs', list);
}


/* Handle GET requests to '/' */
app.get('/', (req, res) => {
  console.log('GET: "/"', req.body);
  // Redirect to first task list.
  res.redirect(`/${lists[0].listName}`);
});


app.get('/Personal', (req, res) => {
  console.log('GET: "/Personal"', req.body);
  renderList(res, "Personal");
});


app.get('/Work', (req, res) => {
  console.log('GET: "/Work"', req.body);
  renderList(res, "Work");
});


app.get('/Miscellaneous', (req, res) => {
  console.log('GET: "/Miscellaneous"', req.body);
  renderList(res, "Miscellaneous");
});


// Handle POST requests to '/'
app.post('/', (req, res) => {
  // Example post body { type: 'education', participants: '2' }
  console.log('POST: "/"', req.body);

  // Find the required list...
  const list = getList(req.body.listName);

  if (!list) {
    // Error, didn't get list.
    console.error(`ERROR: Couldn't get the list with name ${req.body.listName}`);
    // @TODO_EWEN return an http error..  Not sure this is correct.
    res.status(500);
  } else {
    // Push the new item onto the list.
    list.tasks.push(
      { done: false, text: req.body.newItem }
    );

    // Redirect back to the list.
    res.redirect(`/${req.body.listName}`);
  }

});


// Start the app, listening on PORT "PORT".
app.listen(PORT,
  () => {
    console.log(`PROJECT "${PROJECT}": Server is running on http://localhost:${PORT}`);
  }
);
