// popup 脚本：与内容脚本通信，并调用 ModelScope/大模型 API 生成招呼语（原来为 OpenAI）

const apiKeyInput = document.getElementById("apiKey");
const resumeInput = document.getElementById("resume");
const toneInput = document.getElementById("tone");
const generateBtn = document.getElementById("generateBtn");
const statusEl = document.getElementById("status");
const greetingEl = document.getElementById("greeting");

async function loadSettings() {
  const data = await chrome.storage.sync.get(["apiKey", "resume", "tone", "greeting"]);
  if (data.apiKey) apiKeyInput.value = data.apiKey;
  if (data.resume) resumeInput.value = data.resume;
  if (data.tone) toneInput.value = data.tone;
  if (data.greeting) greetingEl.textContent = data.greeting;
}

async function saveSettings() {
  await chrome.storage.sync.set({
    apiKey: apiKeyInput.value.trim(),
    resume: resumeInput.value.trim(),
    tone: toneInput.value.trim()
  });
}

apiKeyInput.addEventListener("change", saveSettings);
resumeInput.addEventListener("change", saveSettings);
toneInput.addEventListener("change", saveSettings);

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function injectContentScript(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"]
    });
  } catch (e) {
    // 已经注入过也没关系
    console.warn("injectContentScript error:", e);
  }
}

async function fetchJobDescription() {
  const tab = await getActiveTab();
  if (!tab || !tab.id) throw new Error("未找到当前标签页");

  await injectContentScript(tab.id);

  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(
      tab.id,
      { type: "GET_JOB_DESCRIPTION" },
      (response) => {
        if (chrome.runtime.lastError) {
          return reject(
            new Error("无法获取页面信息，请刷新页面后重试。")
          );
        }
        if (!response || !response.jobDescription) {
          return reject(
            new Error("未在当前页面识别到岗位描述，请确认已打开职位详情页。")
          );
        }
        resolve(response.jobDescription);
      }
    );
  });
}

async function callOpenAI(apiKey, resume, jd, tone) {
  const systemPrompt =
    "你是一名资深求职顾问，擅长根据候选人的简历和岗位要求，写出简短、有礼貌、真诚且自然的中文求职招呼语。";

  const userPrompt = [
    "下面是候选人的简历简介：",
    resume,
    "",
    "下面是当前岗位的职位描述：",
    jd,
    "",
    "请根据以上信息，生成一段用于主动联系 HR / 招聘者的中文求职招呼语：",
    "要求：",
    "1. 50~150 字左右，简短有重点；",
    "2. 先简要自我介绍和当前情况，再点出 2~3 个与岗位高度匹配的技能或经验；",
    "3. 语气真诚、礼貌，可以稍微口语化，但不要显得过于卑微；",
    "4. 结尾可以表达期待进一步沟通。",
    tone ? `5. 风格偏向：${tone}。` : ""
  ].join("\n");

  // ModelScope 大模型接口
  const body = {
    model: "Qwen/Qwen3.5-35B-A3B",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    // 如果需要流式输出可以设置为 true，并在下面处理 ReadableStream
    stream: false
  };

  const resp = await fetch("https://api-inference.modelscope.cn/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error("调用模型接口失败：" + text);
  }

  const data = await resp.json();
  // ModelScope 的返回结构和 OpenAI 兼容
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("未从模型接口获得有效结果");
  return content;
}

async function onGenerateClick() {
  greetingEl.textContent = "";
  statusEl.textContent = "正在获取页面岗位描述...";

  const apiKey = apiKeyInput.value.trim();
  const resume = resumeInput.value.trim();
  const tone = toneInput.value.trim();

  if (!apiKey) {
    statusEl.textContent = "请先填写 OpenAI API Key。";
    return;
  }
  if (!resume) {
    statusEl.textContent = "请先填写你的简历简介 / 核心技能。";
    return;
  }

  await saveSettings();

  try {
    const jd = await fetchJobDescription();
    statusEl.textContent = "已获取岗位描述，正在生成招呼语...";
    const greeting = await callOpenAI(apiKey, resume, jd, tone);
    statusEl.textContent = "生成完成，已为你定制招呼语：";
    greetingEl.textContent = greeting;
    // 持久化结果，后续打开弹窗或切换应用仍可看到
    await chrome.storage.sync.set({ greeting });
  } catch (e) {
    console.error(e);
    statusEl.textContent = e.message || "发生未知错误，请稍后重试。";
  }
}

generateBtn.addEventListener("click", () => {
  onGenerateClick();
});

const clearBtn = document.getElementById("clearBtn");
clearBtn.addEventListener("click", async () => {
  greetingEl.textContent = "";
  statusEl.textContent = "已清除招呼语。";
  await chrome.storage.sync.remove("greeting");
});

loadSettings().catch((e) => console.error(e));

