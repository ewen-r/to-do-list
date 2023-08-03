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
loadAndCheckEnv();

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
  username: String    // Name of user.
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
    await mongoose.connect(`${process.env.SECRET_MONGO_URI}/${PROJECT}`);
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
    username: { type: String, unique: true },
    password: String,
    googleId: String
  }
);

// Set-up mongoose model for Users database.
const UserModel = new mongoose.model("User", userSchema);

// Setup Local strategy for passport.
passport.use(
  new LocalStrategy(
    async function (username, password, done) {
      const query = {
        username: username
      };

      // Find user in database and verify password...
      const userData = await UserModel.find(query).exec();
      if (!userData.length) {
        console.error("ERROR: Did not find matching user.");
        return done(null, false, { message: 'Incorrect username.' });
      }
      const user = userData[0];
      console.log("INFO: Found user", userData[0]);

      // @TODO_EWEN Passwords should be encrypted.
      if (password !== user.password) {
        console.error("ERROR: Password mismatch.");
        return done(null, false, { message: 'Incorrect username or password.' });
      }
      console.log("INFO: Username and Password matches.");
      return done(null, user);
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
passport.use(new GoogleStrategy(
  {
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    // @TODO_EWEN Change this route for my app.
    callbackURL: "http://localhost:3000/auth/google/secrets",
    userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo"
  },
  function (accessToken, refreshToken, profile, cb) {
    UserModel.findOrCreate({ googleId: profile.id }, function (err, user) {
      return cb(err, user);
    });
  }
));


/** Render index.ejs html file with required task list.
  * @param {res} app response handler.
  * @param {string} name name of the list to render.
*/
async function renderList(res, name) {
  console.log('renderList():', name);

  // Convert task list name to Capitalized case.
  const listName = _.capitalize(name);

  try {
    const query = {
      listName: listName
    };

    // @TODO_EWEN Only find tasks for the logged-in user.
    const listData = await TaskModel.find(query).sort({ "done": 1, "text": 1 }).exec();
    const list = {
      listName: listName,
      tasks: listData
    };
    res.render('index', list);
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


/* Handle GET requests to '/auth/google/login'
 * Landing page on redirection after google authentication.
 * - Use passport to authenticate the user.
 * - - Redirect to tasks page if authentication OK.
*/
app.get("/auth/google/secrets",
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
      res.redirect('login');
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
            password: req.body.password
          }
        ).save();

        // Now the user has registered.. log them in.
        req.login(user, function (err) {
          if (err) {
            console.error("ERROR: Couldn't authenticate new user.", err);
            res.redirect('loginFail');
          }
          console.log("INFO: Login successful. Redirecting");
          res.redirect(`/list/${DEFAULT_LIST}`);
        });
      } catch (err) {
        console.error("ERROR: Couldn't register user.", err);
        res.redirect('registerFail');
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
      console.log(`GET: "list/${req.params.listName}"`, req.body);

      if (req.isAuthenticated()) {
        console.log("INFO: User is authenticated.");
        // Render page for requested listName
        const listName = req.params.listName ? req.params.listName : DEFAULT_LIST;
        renderList(res, listName);
      } else {
        console.log("INFO: User is not authenticated.");
        res.redirect('/login');
      }
    }
  )
  .post(
    // POST Add task to requested listName and then redirect to the task list.
    async function (req, res) {
      console.log(`POST: "list/${req.params.listName}"`, req.body);
      const listName = _.capitalize(req.params.listName);

      if (req.isAuthenticated()) {
        console.log("INFO: User is authenticated.");

        // @TODO_EWEN Get current username so that appropriate records can be targeted.

        /* NOTE: HTML has no way to send a "DELETE" or "PRUNE".
         *  so we check here for a matching _method.
        */

        // Handle DELETE...
        if (req.body._method === "delete") {
          console.log("INFO: delete", req.body);
          await deleteList(listName);
          res.redirect(`/`);
          return;
        }

        // Handle PRUNE...
        if (req.body._method === "prune") {
          console.log("INFO: prune", req.body);
          await pruneList(listName);
          res.redirect(`/list/${listName}`);
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
        res.redirect(`/list/${listName}`);
      } else {
        console.log("INFO: User is not authenticated.");
        res.redirect('/login');
      }
    }
  );


/** Delete a list.
  * @param {string} name name of the list to delete.
*/
async function deleteList(name) {
  console.log('deleteList():', name);

  // Do not delete the default task list.. Just ignore and return.
  if (name === DEFAULT_LIST) {
    console.error("deleteList(): ERROR: Cannot delete this task list");
    return;
  }

  // @TODO_EWEN Get current username so that appropriate records can be targeted.

  // Find all documents in the required list and delete them.
  await TaskModel.deleteMany({
    listName: name
  }).exec();
}


/** Prune a list.
  * @param {string} name name of the list to prune.
*/
async function pruneList(name) {
  console.log("pruneList():", name);

  // @TODO_EWEN Get current username so that appropriate records can be targeted.

  // Find all documents in the required list with "done" and delete them.
  TaskModel.deleteMany({
    listName: name,
    done: true
  }).exec();
}


/* Handle POST requests to '/list/:listName/:_id/done'
 * Find document and update the "done" field.
 * - Redirect back to the list.
*/
app.post('/list/:listName/:_id/done',
  async function (req, res) {
    console.log(`POST: "/list/${req.params.listName}/${req.params._id}/done"`, req.body);

    // Find document and update the "done" field.
    const done = req.body?.done === 'on';
    await TaskModel.findByIdAndUpdate(req.params._id, { done: done }).exec();
    // Redirect back to the list.
    res.redirect(`/list/${req.params.listName}`);
  }
);


/** Load and check env.
  * - If SECRET_MONGO_URI is not set...
  * - - Assume we are in dev mode and try to load it from .env file
  * - Check for Mongo Uri and exit if not found.
*/
function loadAndCheckEnv() {
  console.log('loadAndCheckEnv():');
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

  // Check for required env constants and exit if not found.
  if (
    !process.env.SECRET_MONGO_URI
    || !process.env.SESSION_SECRET
    || !process.env.GOOGLE_CLIENT_ID
    || !process.env.GOOGLE_CLIENT_SECRET) {
    console.error('loadAndCheckEnv(): ERROR: Unable to load all required env values.');
    process.exit(5);
  }
}

//////////////////////////////////////////////////////////////////////////////////////////////
//



// Start the app, listening on PORT "PORT".
app.listen(PORT,
  () => {
    console.log(`PROJECT "${PROJECT}": Server is running on port ${PORT}`);
  }
);
