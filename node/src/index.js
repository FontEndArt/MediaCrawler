/**
 * MediaCrawler入口文件
 * 
 * 注意：本项目仅供学习和研究使用，不得用于商业用途
 * 请遵守相关法律法规，合理使用本工具
 * 切勿用于非法用途，否则后果自负
 */

const KuaishouCrawler = require('./media_platform/kuaishou/core');
const path = require('path');
const fs = require('fs').promises;
const utils = require('./utils');

// 检查配置文件
async function checkAndCreateConfig() {
  const configPath = path.resolve(process.cwd(), 'config.json');
  
  try {
    await fs.access(configPath);
    console.log('配置文件已存在，正在使用现有配置');
  } catch (error) {
    console.log('配置文件不存在，创建默认配置...');
    
    const defaultConfig = {
      "crawler_type": "search", // 爬取类型: search/detail/creator
      "search_keywords": ["搞笑", "宠物"], // 搜索关键词列表
      "video_id_list": [], // 视频ID列表（detail模式使用）
      "creator_id_list": [], // 创作者ID列表（creator模式使用）
      "max_pages": 3, // 最大爬取页数
      "max_comment_pages": 3, // 最大评论页数
      "get_comments": true, // 是否获取评论
      "get_video_detail": true, // 是否获取视频详情（creator模式使用）
      "headless": true, // 是否使用无头模式
      "use_proxy": false, // 是否使用代理
      "ip_proxy_info": { // 代理信息
        "ip": "",
        "port": "",
        "username": "",
        "password": ""
      }
    };
    
    await fs.writeFile(configPath, JSON.stringify(defaultConfig, null, 2), 'utf8');
    console.log('默认配置文件已创建，请根据需要修改后再运行');
    process.exit(0);
  }
}

async function prepareDataDir() {
  // 确保数据目录存在
  const dataDir = path.resolve(process.cwd(), 'data');
  await utils.ensureDir(dataDir);
  
  // 确保各类型数据目录存在
  await utils.ensureDir(path.join(dataDir, 'search'));
  await utils.ensureDir(path.join(dataDir, 'detail'));
  await utils.ensureDir(path.join(dataDir, 'creator'));
}

async function main() {
  console.log('MediaCrawler 正在启动...');
  
  try {
    // 检查配置文件
    await checkAndCreateConfig();
    
    // 准备数据目录
    await prepareDataDir();
    
    // 创建快手爬虫实例并开始爬取
    const crawler = new KuaishouCrawler();
    await crawler.start();
    
  } catch (error) {
    console.error('程序运行出错:', error);
  }
}

// 启动程序
main().catch(err => {
  console.error('未处理的错误:', err);
  process.exit(1);
}); 