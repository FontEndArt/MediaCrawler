/**
 * MediaCrawler
 * 
 * 注意：本项目仅供学习和研究使用，不得用于商业用途
 * 请遵守相关法律法规，合理使用本工具
 * 切勿用于非法用途，否则后果自负
 */

class AbstractCrawler {
  constructor() {
    if (this.constructor === AbstractCrawler) {
      throw new Error("AbstractCrawler cannot be instantiated directly");
    }
  }

  async start() {
    throw new Error("Method 'start' must be implemented");
  }

  async search() {
    throw new Error("Method 'search' must be implemented");
  }

  async getSpecifiedVideos() {
    throw new Error("Method 'getSpecifiedVideos' must be implemented");
  }

  async getCreatorsAndVideos() {
    throw new Error("Method 'getCreatorsAndVideos' must be implemented");
  }

  async close() {
    throw new Error("Method 'close' must be implemented");
  }
}

module.exports = AbstractCrawler; 