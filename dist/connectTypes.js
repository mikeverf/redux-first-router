'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

exports.connectTypes = connectTypes;
exports.go = go;

var _pathToRegexp = require('path-to-regexp');

var _pathToRegexp2 = _interopRequireDefault(_pathToRegexp);

var _formatParams2 = require('./utils/formatParams');

var _formatParams3 = _interopRequireDefault(_formatParams2);

var _parsePath2 = require('./utils/parsePath');

var _parsePath3 = _interopRequireDefault(_parsePath2);

var _nestAction = require('./utils/nestAction');

var _nestAction2 = _interopRequireDefault(_nestAction);

var _routesDictToArray = require('./utils/routesDictToArray');

var _routesDictToArray2 = _interopRequireDefault(_routesDictToArray);

var _actionCreators = require('./actionCreators');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/** REDUCER + MIDDLEWARE + ENHANCER MAIN EXPORT: */

function connectTypes() {
  var routes = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
  var history = arguments[1];
  var options = arguments[2];

  if (process.env.NODE_ENV !== 'production') {
    if (!history) {
      throw new Error('invalid-history-argument', 'Using the \'history\' package on NPM, please provide \n        a history object as a second parameter. The history object will be the return of \n        createBrowserHistory() (or in React Native or Node: createMemoryHistory()).\n        See: https://github.com/mjackson/history');
    }
  }

  var HISTORY = history; //history object created via createBrowserHistory or createMemoryHistory (using history package) passed to createLocationReducer(routes, history)
  var ROUTES_DICT = routes; //{HOME: '/home', INFO: '/info/:param'} -- our route "constants" defined by our user (typically in configureStore.js)
  var ROUTE_NAMES = Object.keys(ROUTES_DICT); //['HOME', 'INFO', 'ETC']
  var ROUTES = (0, _routesDictToArray2.default)(ROUTE_NAMES, ROUTES_DICT); //['/home', '/info/:param/', '/etc/:etc']

  var _parsePath = (0, _parsePath3.default)(history.location.pathname, ROUTES, ROUTE_NAMES),
      type = _parsePath.type,
      payload = _parsePath.payload;

  var currentPathname = void 0;
  var initialized = false;

  var INITIAL_LOCATION_STATE = {
    pathname: history.location.pathname,
    type: type,
    payload: payload,
    prev: {
      pathname: null,
      type: null,
      payload: null
    },
    history: typeof window !== 'undefined' ? history : undefined,
    hydrated: typeof window !== 'undefined' ? false : true
  };

  var onBackNext = options.onBackNext,
      _options$location = options.location,
      locationKey = _options$location === undefined ? 'location' : _options$location,
      readyKey = options.ready,
      titleKey = options.title;

  /** LOCATION REDUCER: */

  function locationReducer() {
    var state = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : INITIAL_LOCATION_STATE;
    var action = arguments[1];

    if (ROUTES_DICT[action.type] || action.type === _actionCreators.NOT_FOUND) {
      state = {
        pathname: action.location.current.pathname,
        type: action.type,
        payload: action.payload || {}, //provide payload so reducers can optionally slice location state and get initial params from URL without the init action dispatched
        prev: action.location.prev || state.prev,
        history: state.history,
        hydrated: typeof window !== 'undefined' ? undefined : true
      };

      if (action.location.load) {
        state.load = true;
      }

      if (action.location.backNext) {
        state.backNext = true;
      }
    }

    return state;
  }

  /** MIDDLEWARE */

  function addressBarMiddleware(store) {
    return function (next) {
      return function (action) {
        if (action.error) {
          if (process.env.NODE_ENV !== 'production') {
            console.warn('AddressBar: location update did not dispatch as your action has an error.');
          }
        } else if (action.type === _actionCreators.INIT) {
          action = initAction(action.payload.pathname);
        } else if (ROUTES_DICT[action.type] && !action.location) {
          //browser back/forward button usage will dispatch with locations and dont need to be re-handled
          action = middlewareAction(action, ROUTES_DICT[action.type], store.getState().location);
        }

        return next(action);
      };
    };
  }

  /** ENHANCER */

  function enhancer(createStore) {
    return function (reducer, preloadedState, enhancer) {
      var store = createStore(reducer, preloadedState, enhancer);
      listen(store);
      return store;
    };
  }

  /** ADDRESS BAR & STATE LISTENER */

  function listen(store) {
    var prevState = void 0;
    var dispatch = store.dispatch.bind(store);
    var state = store.getState();

    if (!state[locationKey] || !state[locationKey].pathname) {
      throw new Error('no-location-reducer', '\n        You must provide the key of the location reducer state \n        or properly assigned the location reducer to the \'location\' state key.\n      ');
    }

    if (typeof window !== 'undefined') {
      HISTORY.listen(handleBrowserBackNextButtons.bind(null, dispatch));

      store.subscribe(function () {
        var state = store.getState();
        onUpdateState(dispatch, state, prevState);
        prevState = state;
      });
    }

    //call once at start to populate location reducer 
    //and if ready dispatch entrance route type
    onUpdateState(dispatch, state);
    prevState = state;
  }

  function onUpdateState(dispatch, next) {
    var prev = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};

    var location = next[locationKey];
    var prevLocation = prev[locationKey];

    var title = next[titleKey];
    var prevTitle = prev[titleKey];

    var ready = next[readyKey];

    if (initialized) {
      changeAddressBar(location, prevLocation);
    } else if (ready && !location.hydrated) {
      var action = initAction(location.pathname);
      dispatch(action); //dispatch entrance route type
    }

    changePageTitle(title, prevTitle);

    //server provided initialState, so we dont need to dispatch initAction
    //and are safe to changeAddressBar from here on out
    if (location.hydrated) {
      initialized = true;
    }
  }

  function handleBrowserBackNextButtons(dispatch, nextLocation) {
    //if browser URL was not changed in response to location reducer state,
    //i.e. from browser back button instead
    if (nextLocation.pathname !== currentPathname) {
      onBackNext && onBackNext(nextLocation);
      currentPathname = nextLocation.pathname;

      var action = backNextAction(currentPathname);
      dispatch(action); //dispatch route type as it changes via back/next buttons usage
    }
  }

  function changeAddressBar(location, prevLocation) {
    if (!location || !prevLocation) return;

    if (location.pathname !== currentPathname) {
      currentPathname = location.pathname;
      HISTORY.push({ pathname: currentPathname });
    }
  }

  function changePageTitle(title, prevTitle) {
    if (typeof window === 'undefined') return;

    if (typeof title === 'string' && title !== prevTitle) {
      //compare location type as well, since title reducer may not
      document.title = title;
    }
  }

  /** ACTION CREATORS: */

  function middlewareAction(action, route, location) {
    try {
      var _formatParams = (0, _formatParams3.default)(route, action.payload),
          routePath = _formatParams.routePath,
          params = _formatParams.params;

      var toPath = _pathToRegexp2.default.compile(routePath);
      var pathname = toPath(params);

      return prepareAction(pathname, action);
    } catch (e) {
      //DEVELOPER DISPATCHED AN INVALID type + payload

      //preserve previous pathname to keep app stable for future correct actions that depend on it
      var _pathname = location && location.pathname || null;
      return prepareAction(_pathname, { type: _actionCreators.NOT_FOUND, payload: action.payload });
    }
  }

  //for exclusive use by initAction and browser back/forward button
  function updateAction(pathname) {
    var routes = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : ROUTES;
    var routeNames = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : ROUTE_NAMES;

    var action = (0, _parsePath3.default)(pathname, routes, routeNames);
    return prepareAction(pathname, action);
  }

  function initAction(pathname) {
    initialized = true; //only after initialized will new history locations be pushed on to the address bar

    var action = updateAction(pathname);
    action.location.load = true;
    return action;
  }

  function backNextAction(pathname) {
    var action = updateAction(pathname);
    action.location.backNext = true;
    return action;
  }

  //NOTE: ROUTES and ROUTE_NAMES put in for purity/testability, and only pathname is expected to be provided
  exportedGo = function exportedGo(pathname) {
    var routes = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : ROUTES;
    var routeNames = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : ROUTE_NAMES;

    return (0, _parsePath3.default)(pathname, routes, routeNames); //prepareAction will eventually be called after client dispatches and middleware resolves it
  };

  var prev = null;

  function prepareAction(pathname, receivedAction) {
    var action = (0, _nestAction2.default)(pathname, receivedAction, prev);
    prev = _extends({}, action.location.current);
    return action;
  }

  return {
    reducer: locationReducer,
    middleware: addressBarMiddleware,
    enhancer: enhancer
  };
}

/** SIDE EFFECT:
 *  won't affect SSR [unless you simulate clicking links server side, and dont do that, use redux actions]) 
 *  client code needs a simple go to path function (also used by exported Link component above)
*/

var exportedGo = void 0;
function go(pathname) {
  return exportedGo(pathname);
}