import { Drizzle } from 'drizzle'
import { put, select, call, take } from "redux-saga/effects";
import { eventChannel } from 'redux-saga';

import { drizzleOptions } from "~/constants";
import { 
  setDrizzleAction, 
  setSubscriptionValueAction,
  setSubscriptionChannelAction
} from '~/reducers';
import { contracts } from '~/constants';
import { txWrapper } from './txWrapper';
import * as selectors from './selectors';

export function* initGenerator(action) {
  const {
    store
  } = action;

  if (!store) {
    return;
  }

  try {
    const drizzle = new Drizzle(drizzleOptions, store);
    
    yield put(setDrizzleAction(drizzle));
  } catch (e) {
    console.error(`Error in drizzle initialization: ${e.message}`);
  }
}

export function* changeContractNameGenerator(action) {
  const {
    name
  } = action;

  const contractName = contracts.NameStorageExample.contractName;
  const methodName = contracts.NameStorageExample.txMethods.changeContractName;

  yield call(txWrapper, contractName, methodName, name);
}

export function* addIndexNameGenerator(action) {
  const {
    name
  } = action;

  const contractName = contracts.NameStorageExample.contractName;
  const methodName = contracts.NameStorageExample.txMethods.addIndexName;

  yield call(txWrapper, contractName, methodName, name);
}

export function* changeAddressNameGenerator(action) {
  const {
    name
  } = action;

  const contractName = contracts.NameStorageExample.contractName;
  const methodName = contracts.NameStorageExample.txMethods.changeAddressName;

  yield call(txWrapper, contractName, methodName, name);
}

export function* getCallGenerator(action) {
  const {
    methodName,
    index
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
  
  if (typeof index !== 'undefined') {
    arrayKey = yield call(drizzleContracts
    [contractName]
    .methods
    [methodName]
    .cacheCall,
    index)
  } else {
    arrayKey = yield call(drizzleContracts
    [contractName]
    .methods
    [methodName]
    .cacheCall)
  }

  yield call(subscribeGenerator, {contractName, methodName, key: arrayKey, index});
}

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

  const valKey = methodName.substring(3).toLowerCase();
  let channelSubscriptions = yield select(selectors.getChannel);
  let channel = channelSubscriptions[methodName];

  if (typeof channel !== 'undefined') {
    channel.close && channel.close();
  }

  channel = yield call(createSubscriptionChannel, store);

  yield put(setSubscriptionChannelAction(methodName, channel));

  while (true) {
    let state = yield call(store.getState);

    const existingValue = yield call(retrieveExistingValue,
      valKey);

    state = yield take(channel);

    const newValue = yield call(retrieveFromState,
      state, contractName, methodName, key);

    if (newValue !== existingValue) {
      yield put(
        setSubscriptionValueAction(
          valKey, 
          newValue
        )
      );
    }
  }
}

function* retrieveExistingValue(valKey) {
  const reducer = yield select(selectors.getNameStorageExampleReducer);
  return reducer[valKey];
}

function createSubscriptionChannel(store) {
  return eventChannel(emit => {
    return store.subscribe(() => {
      emit(store.getState());
    })
  })
}