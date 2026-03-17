// background.js — Opens side panel on action click
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (!tab.url) return;
  const isYT = tab.url.startsWith('https://www.youtube.com/');
  chrome.sidePanel.setOptions({ tabId, path: 'sidebar.html', enabled: isYT });
});
