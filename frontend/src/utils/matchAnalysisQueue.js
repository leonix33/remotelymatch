const MAX_CONCURRENT = 2;
let active = 0;
const waiters = [];

function drain() {
  while (active < MAX_CONCURRENT && waiters.length) {
    const { run, resolve, reject } = waiters.shift();
    active += 1;
    Promise.resolve()
      .then(run)
      .then(resolve, reject)
      .finally(() => {
        active -= 1;
        drain();
      });
  }
}

export function enqueueMatchAnalysis(run) {
  return new Promise((resolve, reject) => {
    waiters.push({ run, resolve, reject });
    drain();
  });
}
