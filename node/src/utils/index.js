const userAgents = require('user-agents');
const fs = require('fs').promises;
const path = require('path');
const fsSync = require('fs');

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

/**
 * 清理过期数据
 * @param {string} directory 要清理的目录
 * @param {number} maxAgeDays 文件保留的最大天数
 * @returns {Promise<number>} 清理的文件数量
 */
async function cleanupOldFiles(directory, maxAgeDays = 1) {
  console.log(`开始清理 ${directory} 目录中超过 ${maxAgeDays} 天的文件...`);
  
  try {
    // 确保目录存在
    await ensureDir(directory);
    
    // 获取当前时间
    const now = Date.now();
    // 计算过期时间（当前时间减去最大保留天数转换为毫秒）
    const expireTime = now - (maxAgeDays * 24 * 60 * 60 * 1000);
    
    // 读取目录中的所有文件
    const files = await fs.readdir(directory);
    let deletedCount = 0;
    
    // 遍历处理每个文件
    for (const file of files) {
      const filePath = path.join(directory, file);
      
      try {
        // 获取文件状态
        const stats = await fs.stat(filePath);
        
        // 如果是文件（非目录）且修改时间早于过期时间，则删除
        if (stats.isFile() && stats.mtimeMs < expireTime) {
          await fs.unlink(filePath);
          console.log(`已删除过期文件: ${filePath}`);
          deletedCount++;
        }
        // 如果是目录，递归清理
        else if (stats.isDirectory()) {
          const subdirDeletedCount = await cleanupOldFiles(filePath, maxAgeDays);
          deletedCount += subdirDeletedCount;
        }
      } catch (err) {
        console.error(`处理文件 ${filePath} 时出错:`, err);
      }
    }
    
    console.log(`${directory} 目录清理完成，共删除 ${deletedCount} 个过期文件`);
    return deletedCount;
  } catch (err) {
    console.error(`清理目录 ${directory} 时出错:`, err);
    return 0;
  }
}

/**
 * 检查文件是否存在
 * @param {string} filePath 文件路径
 * @returns {Promise<boolean>} 文件是否存在
 */
async function fileExists(filePath) {
  try {
    await fs.access(filePath, fsSync.constants.F_OK);
    return true;
  } catch (e) {
    return false;
  }
}

module.exports = {
  getUserAgent,
  sleep,
  ensureDir,
  saveToJson,
  loadConfig,
  cleanupOldFiles,
  fileExists
}; 