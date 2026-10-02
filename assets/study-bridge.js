/* Optional content API. It only passes quiz state, never authentication tokens. */
(() => {
  let restore = () => {};
  window.StudyBridge = {
    onRestore(callback) {
      restore = callback;
      if (window.parent !== window) parent.postMessage({channel:'tmu-study-v1',type:'ready'}, '*');
    },
    save(record) {
      if (window.parent !== window) parent.postMessage({channel:'tmu-study-v1',type:'answer',record}, '*');
    }
  };
  window.addEventListener('message', event => {
    if(event.source !== parent || event.data?.channel !== 'tmu-study-v1' || event.data.type !== 'restore' || !Array.isArray(event.data.records))return;
    restore(event.data.records);
  });
})();
