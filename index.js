import express from "express";
import bodyParser from "body-parser";
import { dirname } from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import dotenv from "dotenv";
import _ from "lodash";
import session from "express-session";
import passport from "passport";
import LocalStrategy from "passport-local";
import GoogleStrategy from "passport-google-oauth20";


// Load and check env.
loadEnv();

/* Set dirname prefix for the current root so that files can be served.
 * e.g res.sendFile(_dirname + '/web/index.html'); */
const _dirname = dirname(fileURLToPath(import.meta.url));

const PROJECT = "to-do-list-app";
const app = express();

const PORT = 3000;
const DEFAULT_LIST = 'Personal';

const TaskSchema = mongoose.Schema;
const ObjectId = TaskSchema.ObjectId;
const myTaskSchema = new TaskSchema({
  id: ObjectId,
  listName: String,   // Name (or ID?) of the task list that this to-do item belongs to.
  text: String,       // The text of the to-do item
  done: Boolean,      // Set to true if the to-do item is done.
  userId: String      // ID of user.
});

// mongoose model for the database.. Used to perform db operations.
const TaskModel = mongoose.model('Task', myTaskSchema);

// Link static files.
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({
  extended: true
}));

// Initialize session.
app.use(session(
  {
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false
  })
);

// Initialize passport.
app.use(passport.initialize());

// Setup passport to authenticate via session.
app.use(passport.authenticate('session'));

// Use passport session.
app.use(passport.session());


/** Connect to MongoDB database
*/
async function connectToDb() {
  console.log('connectToDb():');

  try {
    await mongoose.connect(`${process.env.MONGO_URI}/${PROJECT}`);
    console.log('connectToDb(): Connected.');
  } catch (err) {
    console.error(`connectToDb(): ERROR: ${err}`);
  }
}


// Connect to mongo database.
connectToDb();


// Setup user schema.
const userSchema = new mongoose.Schema(
  {
    password: String,
    username: { type: String, unique: true },
    userStrategy: String
  }
);

// Set-up mongoose model for Users database.
const UserModel = new mongoose.model("User", userSchema);

// Setup Local strategy for passport.
passport.use(
  new LocalStrategy(
    async function (username, password, cb) {
      console.log(`passport.LocalStrategy: username: [${username}]`);

      const query = {
        username: username,
        userStrategy: 'LocalStrategy'
      };

      // Find user in database and verify password...
      const user = await UserModel.findOne(query).exec();
      if (!user) {
        console.error("passport.LocalStrategy: ERROR: Did not find matching user.");
        return cb(null, false, { message: 'Incorrect username.' });
      }
      console.log("passport.LocalStrategy: Found user", user);

      // @TODO_EWEN Passwords should be encrypted.
      if (password !== user.password) {
        console.error("passport.LocalStrategy: ERROR: Password mismatch.");
        return cb(null, false, { message: 'Incorrect username or password.' });
      }
      console.log("passport.LocalStrategy: Username and Password matches.");
      return cb(null, user);
    }
  )
);


// Setup passport serialization.
passport.serializeUser(function (user, cb) {
  process.nextTick(function () {
    cb(null, { id: user.id, username: user.username });
  });
});


// Setup passport deSerialization.
passport.deserializeUser(function (user, cb) {
  process.nextTick(function () {
    return cb(null, user);
  });
});


// Setup Google strategy for passport.
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CLIENT_CALLBACK_URL
    },
    async function (accessToken, refreshToken, profile, cb) {
      console.log(`passport.LocalStrategy: id: [${profile.id}], displayName: [${profile.displayName}]`);
      const query = {
        username: profile.id,
        userStrategy: 'GoogleStrategy'
      };

      // Find user in database...
      let user = await UserModel.findOne(query).exec();
      if (!user) {
        console.error("passport.GoogleStrategy: ERROR: Did not find matching user.");
        // Add user to database.
        user = await UserModel(
          {
            username: profile.id,
            userStrategy: 'GoogleStrategy'
          }
        ).save();
        console.log("passport.GoogleStrategy: Created user", user);
      } else {
        console.log("passport.GoogleStrategy: Found user", user);
      }

      return cb(null, user);
    }
  )
);


/** Render task list html file with required items.
  * @param {any} res Response handler.
  * @param {string} listName Name of the list to render.
  * @param {string} userId ID of the user.
*/
async function renderList(res, listName, userId) {
  console.log('renderList():', listName, userId);

  // Convert task list name to Capitalized case.
  const _listName = _.capitalize(listName);

  try {
    // Find entries for required listName and userId.
    const query = {
      listName: _listName,
      userId: userId
    };

    const listData = await TaskModel.find(query).sort({ "done": 1, "text": 1 }).exec();

    // Package the returned records into a format for the ejs render.
    const ejsData = {
      listName: _listName,
      tasks: listData
    };

    // Render the task list page.
    res.render('index', ejsData);
  } catch (err) {
    console.error(`renderList(): ERROR: ${err}`);
  }
}


/* Handle GET requests to '/'
 * - Render 'Home' page. */
app.get('/',
  (req, res) => {
    console.log('GET: "/"', req.body);
    res.render("home");
  }
);


/* Handle GET requests to '/auth/google'
 * - Use passport to authenticate the user via google OAuth.
*/
app.get("/auth/google",
  passport.authenticate('google', { scope: ["profile"] })
);


/* Handle GET requests to '/auth/google/reply'
 * Landing page on redirection after google authentication.
 * - Use passport to authenticate the user.
 * - - Redirect to tasks page if authentication OK.
*/
app.get("/auth/google/reply",
  passport.authenticate(
    'google',
    {
      successReturnToOrRedirect: `/list/${DEFAULT_LIST}`,
      failureRedirect: '/loginFail',
      failureMessage: true
    }
  )
);


/* Handle GET requests to '/login'
 * - Render 'login' page.
*/
app.get("/login", function (req, res) {
  console.log('GET: "/login"', req.body);
  res.render("login");
});


/* Handle POST requests to '/login'
 * - Login the user.
*/
app.post("/login",
  passport.authenticate(
    'local',
    {
      successReturnToOrRedirect: `/list/${DEFAULT_LIST}`,
      failureRedirect: '/loginFail',
      failureMessage: true
    }
  )
);


/* Handle GET requests to '/logout'
 * - Log the user out.
 * - Redirect to Home page.
*/
app.get('/logout',
  function (req, res) {
    console.log('GET: "/logout"', req.body);
    req.logout(function (err) {
      res.redirect('/');
    });
  }
);


/* Handle GET requests to '/error'
 * - Render 'home' page with an error message.
*/
app.get("/error", function (req, res) {
  console.log('GET: "/error"', req.body);
  const msg = "Something went wrong.";
  res.render("home", { error: msg });
});


/* Handle GET requests to '/loginFail'
 * - Render 'home' page with an error message.
*/
app.get("/loginFail", function (req, res) {
  console.log('GET: "/loginFail"', req.body);
  const msg = "Login failed.";
  res.render("home", { error: msg });
});


/* Handle GET requests to '/registerFail'
 * - Render 'home' page with an error message.
*/
app.get("/registerFail", function (req, res) {
  console.log('GET: "/registerFail"', req.body);
  const msg = "Registration failed.";
  res.render("home", { error: msg });
});


/* Handle GET and POST requests to '/register'
 * - Render 'register' page.
*/
app.route('/register')
  .get(
    function (req, res) {
      // Render 'register' page.
      console.log('GET: "/register"', req.body);
      res.render("register");
    }
  )
  .post(
    async function (req, res) {
      // Register the user using passport local.
      console.log('POST: "/register"');
      try {
        console.log('INFO: Adding user to database.');
        // Add user to database.
        const user = await UserModel(
          {
            username: req.body.username,
            password: req.body.password,
            userStrategy: 'LocalStrategy'
          }
        ).save();

        /* Now the user has registered.. log them in.
         * - If fail to login.. redirect to /loginFail.
         * - Otherwise.. redirect to default list.
        */
        req.login(user, function (err) {
          if (err) {
            console.error("ERROR: Couldn't authenticate new user.", err);
            res.redirect('/loginFail');
          }
          console.log("INFO: Login successful. Redirecting");
          res.redirect(`/list/${DEFAULT_LIST}`);
        });
      } catch (err) {
        console.error("ERROR: Couldn't register user.", err);
        res.redirect('/registerFail');
      }
    }
  );


/* Handle REST-ful (GET and POST) requests to '/list/:listName'
 * - GET Render page for requested listName.
 * - POST Add task to requested listName and then redirect to the task list.
*/
app.route('/list/:listName')
  .get(
    // GET Render page for requested listName.
    function (req, res) {
      console.log(`GET: "/list/${req.params.listName}"`, req.body);

      /* Check user is authenticated...
       * - If fail.. redirect to /login.
       * - Otherwise.. render required list.
      */
      if (req.isAuthenticated()) {
        console.log("INFO: User is authenticated.");
        // Get userId from request so that appropriate records can be targeted.
        const userId = req.user.id;
        const userName = req.user.username;
        console.log(`INFO: user{ id: ${userId} name: ${userName} }"`);

        // Render task list html file with required items.
        const listName = req.params.listName ? req.params.listName : DEFAULT_LIST;
        renderList(res, listName, userId);
      } else {
        console.log("INFO: User is not authenticated.");
        res.redirect('/login');
      }
    }
  )
  .post(
    // POST Add task to requested listName and then redirect to the task list.
    async function (req, res) {
      console.log(`POST: "/list/${req.params.listName}"`, req.body);
      const listName = _.capitalize(req.params.listName);

      if (req.isAuthenticated()) {
        console.log("INFO: User is authenticated.");

        // Get userId from request so that appropriate records can be targeted.
        const userId = req.user.id;
        const userName = req.user.username;
        console.log(`INFO: user{ id: ${userId} name: ${userName} }"`);

        /* NOTE: HTML has no way to send a "DELETE" or "PRUNE".
         *  so we check here for a matching _method.
        */

        /* Handle DELETE...
         * - Delete all items for the given list.
         * - Redirect back to default list.
        */
        if (req.body._method === "delete") {
          console.log("INFO: delete", req.body);
          await deleteList(listName, userId);
          res.redirect(`/list/${DEFAULT_LIST}`);
          return;
        }

        /* Handle PRUNE...
         * - Delete all completed items for the given list.
         * - Redirect back to current list.
        */
        if (req.body._method === "prune") {
          console.log("INFO: prune", req.body);
          await pruneList(listName, userId);
          res.redirect(`/list/${listName}`);
          return;
        }

        // Handle all other POST requests...
        await TaskModel(
          {
            listName: req.params.listName,
            text: req.body.newItem,
            done: false,
            userId: userId
          }
        ).save();

        // Redirect back to the current list.
        res.redirect(`/list/${listName}`);
      } else {
        console.log("INFO: User is not authenticated.");
        res.redirect('/login');
      }
    }
  );


/** Delete a list.
  * @param {string} listName Name of the list to delete.
  * @param {string} userId ID of the user.
*/
async function deleteList(listName, userId) {
  console.log('deleteList():', listName, userId);

  // Do not delete the default task list.. Just ignore and return.
  if (listName === DEFAULT_LIST) {
    console.error("deleteList(): ERROR: Cannot delete this task list");
    return;
  }

  // Find all items in the required list and delete them.
  const query = {
    listName: listName,
    userId: userId
  };

  await TaskModel.deleteMany(query).exec();
}


/** Prune a list.
  * @param {string} listName Name of the list to prune.
  * @param {string} userId ID of the user.
*/
async function pruneList(listName, userId) {
  console.log("pruneList():", listName, userId);

  // Find all items in the required list with "done" and delete them.
  const query = {
    listName: listName,
    userId: userId,
    done: true
  };

  TaskModel.deleteMany(query).exec();
}


/* Handle POST requests to '/list/:listName/:_id/done'
 * Find document and update the "done" field.
 * - Redirect back to the list.
*/
app.post('/list/:listName/:_id/done',
  async function (req, res) {
    console.log(`POST: "/list/${req.params.listName}/${req.params._id}/done  user{ id: ${req.user.id} name: ${req.user.username} }"`, req.body, req.user);

    // Find document and update the "done" field.
    const done = req.body?.done === 'on';
    await TaskModel.findByIdAndUpdate(req.params._id, { done: done }).exec();
    // Redirect back to the current list.
    res.redirect(`/list/${req.params.listName}`);
  }
);


/** Load and check env.
  * - If vars are not set...
  * - - Assume we are in dev mode and try to load vars from .env file
  * - Check for required env variables and exit if not found.
*/
function loadEnv() {
  console.log('loadEnv():');
  console.log('=========================');

  // If vars are not set...
  if (!checkVars()) {
    // Assume we are in dev mode and try to load vars from .env file
    console.log('= RUNNING LOCALLY');
    dotenv.config();
  } else {
    console.log('= RUNNING PRODUCTION');
  }

  console.log('=========================');

  // Check for required env constants and exit if not found.
  if (!checkVars()) {
    console.error('loadEnv(): ERROR: Unable to load all required env values.');
    process.exit(5);
  }
}


function checkVars() {
  // return true if all required vars are loaded.
  return (process.env.MONGO_URI
    && process.env.SESSION_SECRET
    && process.env.GOOGLE_CLIENT_ID
    && process.env.GOOGLE_CLIENT_SECRET
    && process.env.GOOGLE_CLIENT_CALLBACK_URL);
}

//////////////////////////////////////////////////////////////////////////////////////////////
//



// Start the app, listening on PORT "PORT".
app.listen(PORT,
  () => {
    console.log(`PROJECT "${PROJECT}": Server is running on port ${PORT}`);
  }
);
