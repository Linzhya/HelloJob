// 内容脚本：从当前页面提取岗位描述

function extractJobDescription() {
  const candidates = [
    'section[data-cy="job-description"]',
    'section[data-qa="job-description"]',
    '.job-description',
    '#jobDescriptionText',
    'article',
    'main'
  ];

  for (const sel of candidates) {
    const el = document.querySelector(sel);
    if (el) {
      const text = el.innerText.trim();
      if (text.length > 200) {
        return text.slice(0, 8000);
      }
    }
  }

  const bodyText = document.body?.innerText || "";
  return bodyText.trim().slice(0, 8000);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_JOB_DESCRIPTION") {
    const jd = extractJobDescription();
    sendResponse({ jobDescription: jd });
  }
  // 声明异步响应
  return true;
});

