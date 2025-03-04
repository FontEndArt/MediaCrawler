const { HttpsProxyAgent } = require('https-proxy-agent');
const { HttpProxyAgent } = require('http-proxy-agent');

/**
 * IP代理信息模型
 */
class IpInfoModel {
  constructor(ip, port, username = null, password = null) {
    this.ip = ip;
    this.port = port;
    this.username = username;
    this.password = password;
  }

  /**
   * 转换为代理URL
   */
  toProxyUrl() {
    if (this.username && this.password) {
      return `http://${this.username}:${this.password}@${this.ip}:${this.port}`;
    }
    return `http://${this.ip}:${this.port}`;
  }
}

/**
 * 格式化代理信息为不同的客户端所需格式
 * @param {IpInfoModel} ipProxyInfo 代理信息
 * @returns {{playwrightProxy: object|null, axiosProxy: object|null}} 格式化后的代理信息
 */
function formatProxyInfo(ipProxyInfo) {
  if (!ipProxyInfo) {
    return { playwrightProxy: null, axiosProxy: null };
  }

  const proxyUrl = ipProxyInfo.toProxyUrl();
  
  // Playwright代理格式
  const playwrightProxy = {
    server: proxyUrl
  };

  // Axios代理格式
  const httpsAgent = new HttpsProxyAgent(proxyUrl);
  const httpAgent = new HttpProxyAgent(proxyUrl);
  const axiosProxy = {
    httpsAgent,
    httpAgent
  };

  return { playwrightProxy, axiosProxy };
}

module.exports = {
  IpInfoModel,
  formatProxyInfo
}; 