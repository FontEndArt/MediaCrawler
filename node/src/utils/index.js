const userAgents = require('user-agents');
const fs = require('fs').promises;
const path = require('path');

/**
 * 获取随机的User-Agent
 * @returns {string} 随机User-Agent字符串
 */
function getUserAgent() {
  return new userAgents({ deviceCategory: 'desktop' }).toString();
}

/**
 * 随机延迟一段时间
 * @param {number} min 最小延迟时间(ms)
 * @param {number} max 最大延迟时间(ms)
 * @returns {Promise<void>}
 */
async function sleep(min = 1000, max = 3000) {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * 确保目录存在
 * @param {string} dirPath 目录路径
 * @returns {Promise<void>}
 */
async function ensureDir(dirPath) {
  try {
    await fs.access(dirPath);
  } catch {
    await fs.mkdir(dirPath, { recursive: true });
  }
}

/**
 * 保存数据到JSON文件
 * @param {string} filePath 文件路径
 * @param {object} data 要保存的数据
 * @returns {Promise<void>}
 */
async function saveToJson(filePath, data) {
  const dir = path.dirname(filePath);
  await ensureDir(dir);
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * 将字符串cookie转换为对象
 * @param {string} cookieStr cookie字符串
 * @returns {object} cookie对象
 */
function convertStrCookieToObj(cookieStr) {
  if (!cookieStr) return {};
  
  return cookieStr.split(';')
    .map(item => item.trim())
    .filter(Boolean)
    .reduce((acc, item) => {
      const [key, value] = item.split('=');
      if (key && value) {
        acc[key.trim()] = value.trim();
      }
      return acc;
    }, {});
}

/**
 * 将cookie对象转换为字符串
 * @param {object} cookieObj cookie对象
 * @returns {string} cookie字符串
 */
function convertObjCookieToStr(cookieObj) {
  return Object.entries(cookieObj)
    .map(([key, value]) => `${key}=${value}`)
    .join('; ');
}

/**
 * 从浏览器cookie数组转换为cookie字符串和对象
 * @param {Array} cookies 浏览器cookie数组
 * @returns {Array} [cookie字符串, cookie对象]
 */
function convertCookies(cookies) {
  const cookieObj = cookies.reduce((acc, cookie) => {
    acc[cookie.name] = cookie.value;
    return acc;
  }, {});
  
  const cookieStr = convertObjCookieToStr(cookieObj);
  return [cookieStr, cookieObj];
}

/**
 * 加载配置文件
 * @param {string} configPath 配置文件路径
 * @returns {Promise<object>} 配置对象
 */
async function loadConfig(configPath) {
  try {
    const configData = await fs.readFile(configPath, 'utf8');
    return JSON.parse(configData);
  } catch (error) {
    console.error(`加载配置文件失败: ${error.message}`);
    throw error;
  }
}

module.exports = {
  getUserAgent,
  sleep,
  ensureDir,
  saveToJson,
  loadConfig
}; 