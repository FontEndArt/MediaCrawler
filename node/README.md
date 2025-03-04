# MediaCrawler - Node.js版本

这是MediaCrawler的Node.js实现版本，一个用于爬取快手平台媒体内容的工具。

## 免责声明

**注意：本项目仅供学习和研究使用，不得用于商业用途**

请遵守相关法律法规，合理使用本工具，切勿用于非法用途，否则后果自负。

## 功能特点

- 多种爬取模式：搜索模式、详情模式、创作者模式
- 支持代理IP配置，避免封禁
- 支持爬取视频基本信息、详情和评论
- 反爬虫检测，模拟真实用户行为
- 并发控制，防止过度请求
- 数据本地持久化存储

## 安装

```bash
# 克隆仓库
git clone https://github.com/yourusername/MediaCrawler.git
cd MediaCrawler/node

# 安装依赖
npm install
```

## 使用方法

1. 首次运行，系统会自动生成默认配置文件：

```bash
npm start
```

2. 修改配置文件 `config.json` 以满足你的需求：

```json
{
  "crawler_type": "search",  // 爬取类型: search/detail/creator
  "search_keywords": ["搞笑", "宠物"],  // 搜索关键词列表
  "video_id_list": [],  // 视频ID列表（detail模式使用）
  "creator_id_list": [],  // 创作者ID列表（creator模式使用）
  "max_pages": 3,  // 最大爬取页数
  "max_comment_pages": 3,  // 最大评论页数
  "get_comments": true,  // 是否获取评论
  "get_video_detail": true,  // 是否获取视频详情（creator模式使用）
  "headless": true,  // 是否使用无头模式
  "use_proxy": false,  // 是否使用代理
  "ip_proxy_info": {  // 代理信息
    "ip": "",
    "port": "",
    "username": "",
    "password": ""
  }
}
```

3. 再次运行程序开始爬取：

```bash
npm start
```

## 爬取模式说明

### 1. 搜索模式 (`crawler_type: "search"`)

根据关键词搜索视频内容，可以设置多个关键词。

需要配置：
- `search_keywords`: 搜索关键词列表
- `max_pages`: 每个关键词爬取的最大页数

### 2. 详情模式 (`crawler_type: "detail"`)

根据视频ID列表获取视频详细信息。

需要配置：
- `video_id_list`: 要爬取的视频ID列表

### 3. 创作者模式 (`crawler_type: "creator"`)

爬取指定创作者的所有视频。

需要配置：
- `creator_id_list`: 创作者ID列表
- `get_video_detail`: 是否获取每个视频的详细信息

## 数据存储

爬取的数据将保存在 `data` 目录下，按照不同的爬取模式分别存储：
- `data/search/关键词/`: 搜索模式下的数据
- `data/detail/`: 详情模式下的数据
- `data/creator/创作者ID/`: 创作者模式下的数据

## 使用代理

如需使用代理，请设置：
- `use_proxy`: 设置为 `true`
- 配置 `ip_proxy_info` 部分的代理信息

## 技术栈

- Node.js
- Playwright (浏览器自动化)
- Axios (HTTP客户端)
- p-limit (并发控制)

## 注意事项

- 请合理控制爬取频率，避免对目标网站造成压力
- 爬取的内容仅用于个人学习和研究，请勿传播和用于商业用途
- 部分功能可能需要登录才能使用，目前版本不支持自动登录
- 网站可能会更新反爬策略，如遇到问题请及时更新代码 