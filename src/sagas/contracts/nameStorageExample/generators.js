import { put, select, call, take } from "redux-saga/effects";
import { eventChannel } from 'redux-saga';

import { drizzleOptions } from "src/constants";
import { 
  setDrizzleAction, 
  setSubscriptionValueAction,
  setSubscriptionChannelAction
} from 'src/reducers';
import { contracts } from 'src/constants';
import { txWrapper } from './txWrapper';
import * as selectors from './selectors';

/**
 * Initialize Drizzle and sets it via reducer
 * @param {object} action.store store for drizzle
 **/
export function* initGenerator(action) {
  const {
    store
  } = action;

  if (!store) {
    return;
  }

  try {
    let drizzle = {};
    
    if (typeof window !== 'undefined') {
      const Drizzle = require('src/lib/Drizzle').default;
      drizzle = new Drizzle(drizzleOptions, store);
    }
    
    yield put(setDrizzleAction(drizzle));
  } catch (e) {
    console.log(`Error in drizzle initialization: ${e.message}`);
  }
}

/**
 * Change contract name transaction method
 * @param {string} action.name name to be changed
 **/
export function* changeContractNameGenerator(action) {
  const {
    name
  } = action;

  const from = yield call(getFrom);
  const contractName = contracts.NameStorageExample.contractName;
  const methodName = contracts.NameStorageExample.txMethods.changeContractName;

  yield call(txWrapper, contractName, methodName, name, from);
}

/**
 * Add index name transaction method
 * @param {string} action.name name to be added
 **/
export function* addIndexNameGenerator(action) {
  const {
    name
  } = action;

  const from = yield call(getFrom);
  const contractName = contracts.NameStorageExample.contractName;
  const methodName = contracts.NameStorageExample.txMethods.addIndexName;

  yield call(txWrapper, contractName, methodName, name, from);
}

/**
 * Change sender's address name transaction method
 * @param {string} action.name name for the sender's address to be changed
 **/
export function* changeAddressNameGenerator(action) {
  const {
    name
  } = action;

  const from = yield call(getFrom);
  const contractName = contracts.NameStorageExample.contractName;
  const methodName = contracts.NameStorageExample.txMethods.changeAddressName;

  yield call(txWrapper, contractName, methodName, name, from);
}

function* getFrom() {
  const accounts = yield select(selectors.getAccounts);
  if (accounts) {
    return {
      from: accounts[0]
    }
  } else {
    return {
      from: "0x0"
    }
  }
}

/**
 * Generic call wrapper to start subscribing for value changes
 * @param {string} action.methodName the contract's name to subscribe for changes
 * @param {object} action.index the optional method argument
 **/
export function* getCallGenerator(action) {
  const {
    methodName,
    args
  } = action;

  const contractName = contracts.NameStorageExample.contractName;
  const drizzleContracts = yield select(selectors.getContracts);

  if (!drizzleContracts) {
    return;
  }

  if (!drizzleContracts[contractName]) {
    return;
  }

  let arrayKey = undefined;

  // stop/return if any of the arguments passed are 'undefined'
  for (let argKey in args) {
    if (typeof args[argKey] === 'undefined') {
      return;
    }
  }
  
  if (args.length) {
    arrayKey = yield call(drizzleContracts
    [contractName]
    .methods
    [methodName]
    .cacheCall,
    ...args) 
  } else {
    arrayKey = yield call(drizzleContracts
    [contractName]
    .methods
    [methodName]
    .cacheCall)
  }

  yield call(subscribeGenerator, {contractName, methodName, key: arrayKey});
}

/**
 * Retrieve value from the smart contract state
 * @param {object} state the state to look up
 * @param {string} contractName the desired contract name
 * @param {string} methodName the desired method name
 * @param {string} key the key if arguments were passed by cacheCall()
 **/
function retrieveFromState(state, contractName, methodName, key) {
  if (state.contracts
    [contractName]
    [methodName]
    [key]) {
      return state.contracts
        [contractName]
        [methodName]
        [key]
        .value
    }
  return undefined;
}

/**
 * Watches for subscribed changes and notifies the reducer
 * @param {string} contractName the desired contract name
 * @param {string} methodName the desired method name
 * @param {string} key the key if arguments were passed by cacheCall()
 **/
export function* subscribeGenerator(action) {
  const {
    contractName,
    methodName,
    key,
  } = action;

  let store = yield select(selectors.getStore);

  if (!store) {
    return;
  }

  const newKey = methodName;

  //check for existing subscription channel for that method
  let channelSubscriptions = yield select(selectors.getChannel);
  let channel = channelSubscriptions[methodName];

  //close channel if existing
  if (typeof channel !== 'undefined') {
    channel.close && channel.close();
  }

  //open new event channel for subscriptions
  channel = yield call(createSubscriptionChannel, store);

  //set it in the reducer to prevent multiple subscriptions
  yield put(setSubscriptionChannelAction(methodName, channel));

  while (true) {
    //retrieve old state
    let state = yield call(store.getState);

    const existingValue = yield call(retrieveExistingValue,
      newKey);

    //wait for new state
    state = yield take(channel);

    const newValue = yield call(retrieveFromState,
      state, contractName, methodName, key);

    //if watched value has been changed, set in reducer to notify components
    if (newValue !== existingValue) {
      yield put(
        setSubscriptionValueAction(
          newKey, 
          newValue
        )
      );
    }
  }
}

/**
 * Helper function for retrieving existing value to key from reducer
 * @param {string} key the key for the desired value to look up
 * @returns {string} value to key param
 **/
function* retrieveExistingValue(valKey) {
  const reducer = yield select(selectors.getNameStorageExampleReducer);
  return reducer[valKey];
}

/**
 * Creates Saga event channel for store subscription
 * @param {object} store desired store to subscribe for changes
 * @returns {object} saga unsubscribe
 **/
function createSubscriptionChannel(store) {
  return eventChannel(emit => {
    return store.subscribe(() => {
      emit(store.getState());
    })
  })
}