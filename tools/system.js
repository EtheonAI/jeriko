const si = require('systeminformation');
const os = require('os');

async function getSystemInfo() {
  const [cpu, mem, disk, osInfo, network] = await Promise.all([
    si.cpu(),
    si.mem(),
    si.fsSize(),
    si.osInfo(),
    si.networkInterfaces(),
  ]);

  return {
    hostname: os.hostname(),
    platform: `${osInfo.distro} ${osInfo.release}`,
    arch: osInfo.arch,
    cpu: `${cpu.manufacturer} ${cpu.brand} (${cpu.cores} cores)`,
    cpuLoad: await si.currentLoad().then(l => `${l.currentLoad.toFixed(1)}%`),
    memory: {
      total: formatBytes(mem.total),
      used: formatBytes(mem.used),
      free: formatBytes(mem.free),
      percent: `${((mem.used / mem.total) * 100).toFixed(1)}%`,
    },
    disks: disk.map(d => ({
      mount: d.mount,
      size: formatBytes(d.size),
      used: formatBytes(d.used),
      percent: `${d.use.toFixed(1)}%`,
    })),
    uptime: formatUptime(os.uptime()),
  };
}

async function getProcesses(opts = {}) {
  const procs = await si.processes();
  let list = procs.list.sort((a, b) => b.cpu - a.cpu);
  if (opts.limit) list = list.slice(0, opts.limit);
  return list.map(p => ({
    pid: p.pid,
    name: p.name,
    cpu: `${p.cpu.toFixed(1)}%`,
    mem: `${p.mem.toFixed(1)}%`,
    state: p.state,
  }));
}

async function getNetworkInfo() {
  const [interfaces, stats] = await Promise.all([
    si.networkInterfaces(),
    si.networkStats(),
  ]);
  return {
    interfaces: interfaces.map(i => ({
      name: i.iface,
      ip4: i.ip4,
      ip6: i.ip6,
      mac: i.mac,
      type: i.type,
      speed: i.speed ? `${i.speed} Mbps` : 'unknown',
    })),
    traffic: stats.map(s => ({
      interface: s.iface,
      rxSec: formatBytes(s.rx_sec) + '/s',
      txSec: formatBytes(s.tx_sec) + '/s',
    })),
  };
}

async function getBattery() {
  const battery = await si.battery();
  if (!battery.hasBattery) return { hasBattery: false };
  return {
    hasBattery: true,
    percent: `${battery.percent}%`,
    charging: battery.isCharging,
    timeRemaining: battery.timeRemaining > 0 ? `${battery.timeRemaining} min` : 'calculating',
  };
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return [d && `${d}d`, h && `${h}h`, `${m}m`].filter(Boolean).join(' ');
}

module.exports = { getSystemInfo, getProcesses, getNetworkInfo, getBattery };
