// Web Worker for heavy analytics computations
self.onmessage = function(e) {
  const { type, data } = e.data;
  
  switch (type) {
    case 'CALCULATE_METRICS':
      const result = calculateMetrics(data);
      self.postMessage({ type: 'METRICS_CALCULATED', result });
      break;
      
    case 'PROCESS_LARGE_DATASET':
      const processed = processDataset(data);
      self.postMessage({ type: 'DATASET_PROCESSED', result: processed });
      break;
      
    default:
      console.warn('Unknown worker message type:', type);
  }
};

function calculateMetrics(data: any[]) {
  // Heavy computation that would block UI
  const metrics = {
    total: data.length,
    sum: data.reduce((acc, item) => acc + (item.value || 0), 0),
    average: 0,
    trends: []
  };
  
  metrics.average = metrics.total > 0 ? metrics.sum / metrics.total : 0;
  
  // Calculate trends (expensive operation)
  for (let i = 1; i < data.length; i++) {
    const current = data[i].value || 0;
    const previous = data[i - 1].value || 0;
    metrics.trends.push({
      period: i,
      change: current - previous,
      percentage: previous !== 0 ? ((current - previous) / previous) * 100 : 0
    });
  }
  
  return metrics;
}

function processDataset(data: any[]) {
  // Simulate heavy processing
  return data.map((item, index) => ({
    ...item,
    processed: true,
    index,
    timestamp: Date.now()
  }));
}