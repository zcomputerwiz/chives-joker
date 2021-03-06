import { Action } from 'redux';
import { ThunkAction } from 'redux-thunk';
import type { RootState } from './rootReducer';
import type PlotAdd from '../types/PlotAdd';
import type PlotQueueItem from '../types/PlotQueueItem';
import { startPlotting } from './plotter_messages';
import PlotStatus from '../constants/PlotStatus';
import { stopService } from './daemon_messages';
import { service_plotter } from '../util/service_names';


type PlotQueueItemPartial = PlotQueueItem & {
  log_new?: string;
};

function mergeQueue(
  currentQueue: PlotQueueItem[],
  partialQueue: PlotQueueItemPartial[],
  event: string,
): PlotQueueItem[] {
  let result = [...currentQueue];

  partialQueue.forEach((item) => {
    const { id, log, log_new, ...rest } = item;

    const index = currentQueue.findIndex((queueItem) => queueItem.id === id);
    if (index === -1) {
      result = [...currentQueue, item];
      return;
    }

    const originalItem = currentQueue[index];

    const newItem = {
      ...originalItem,
      ...rest,
    };

    if (event === 'log_changed' && log_new !== undefined) {
      const newLog = originalItem.log
        ? `${originalItem.log}${log_new}`
        : log_new;

      newItem.log = newLog;
    }

    result = Object.assign([...result], { [index]: newItem });
  });

  return addPlotProgress(result);
}

export function plotQueueAdd(
  config: PlotAdd,
): ThunkAction<any, RootState, unknown, Action<Object>> {
  return (dispatch) => {
    const {
/*      bladebitDisableNUMA,
      bladebitWarmStart,*/
      c,
      delay,
      disableBitfieldPlotting,
      excludeFinalDir,
      farmerPublicKey,
      finalLocation,
      fingerprint,
      madmaxNumBucketsPhase3,
      madmaxTempToggle,
      madmaxThreadMultiplier,
      maxRam,
      numBuckets,
      numThreads,
      overrideK,
      parallel,
      plotCount,
      plotSize,
      plotterName,
      poolPublicKey,
      queue,
      workspaceLocation,
      workspaceLocation2,
    } = config;

    return dispatch(
      startPlotting(
        plotterName,
        plotSize,
        plotCount,
        workspaceLocation,
        workspaceLocation2 || workspaceLocation,
        finalLocation,
        maxRam,
        numBuckets,
        numThreads,
        queue,
        fingerprint,
        parallel,
        delay,
        disableBitfieldPlotting,
        excludeFinalDir,
        overrideK,
        farmerPublicKey,
        poolPublicKey,
        c,
/*        bladebitDisableNUMA,
        bladebitWarmStart,*/
        madmaxNumBucketsPhase3,
        madmaxTempToggle,
        madmaxThreadMultiplier,
      ),
    );
  };
}

export function plotQueueInit(
  queue: PlotQueueItem[],
): ThunkAction<any, RootState, unknown, Action<Object>> {
  return (dispatch) => {
    dispatch({
      type: 'PLOT_QUEUE_INIT',
      queue,
    });
  };
}

export function plotQueueUpdate(
  queue: PlotQueueItem[],
  event: string,
): ThunkAction<any, RootState, unknown, Action<Object>> {
  return (dispatch) => {
    dispatch({
      type: 'PLOT_QUEUE_UPDATE',
      queue,
      event,
    });
  };
}

export function plotQueueDelete(
  id: string,
): ThunkAction<any, RootState, unknown, Action<Object>> {
  return (dispatch, getState) => {
    const {
      plot_queue: { queue },
    } = getState();

    const queueItem = queue.find((item) => item.id === id);
    if (!queueItem) {
      return;
    }

    if (queueItem.state === PlotStatus.RUNNING) {
      dispatch(stopService(service_plotter)); // TODO replace with stopPlotting(id)
    }
  };
}

type PlotQueueState = {
  queue: PlotQueueItem[];
  deleting: string[];
  event?: string;
};

const initialState: PlotQueueState = {
  queue: [],
  deleting: [],
};

function parseProgressUpdate(line: string, currentProgress: number): number {
  let progress: number = currentProgress;
  if (line.startsWith("Progress update: ")) {
    progress = Math.min(1, parseFloat(line.substr("Progress update: ".length)));
  }
  return progress;
}

function addPlotProgress(queue: PlotQueueItem[]): PlotQueueItem[] {
  if (!queue) {
    return queue;
  }

  return queue.map((item) => {
    const { log, state } = item;
    if (state === 'FINISHED') {
      return {
        ...item,
        progress: 1.0,
      };
    } else if (state !== 'RUNNING') {
      return item;
    }

    let progress = item.progress || 0;

    if (log) {
      const lines = log.trim().split(/\r\n|\r|\n/);
      const lastLine = lines[lines.length - 1];

      progress = parseProgressUpdate(lastLine, progress);
    }

    return {
      ...item,
      progress,
    };
  });
}

export default function plotQueueReducer(
  state = { ...initialState },
  action: any,
): PlotQueueState {
  const { queue } = action;

  switch (action.type) {
    case 'PLOT_QUEUE_INIT':
      return {
        ...state,
        queue: addPlotProgress(queue),
      };
    case 'PLOT_QUEUE_UPDATE':
      return {
        ...state,
        queue: mergeQueue(state.queue, queue, action.event),
        event: action.event,
      };
    default:
      return state;
  }
}
