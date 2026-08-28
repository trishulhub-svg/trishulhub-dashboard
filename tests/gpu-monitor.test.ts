import { describe, expect, it } from "vitest"
import { parseMonitorHtml } from "@/lib/gpu-monitor"

describe("Trishul Cloud telemetry parser", () => {
  it("extracts detailed CPU, system, and process data from monitor v7", () => {
    const html = `
      <div class="label">System health</div>
      <div class="health">HEALTHY</div>
      <div class="hint">Laptop is running normally</div>

      <div class="label">CPU load</div>
      <div class="value">21%</div>
      <div class="hint">2394 MHz</div>

      <div class="label">Memory</div>
      <div class="value">62%</div>
      <div class="hint">4.55 / 7.33 GB</div>

      <div class="label">Live CPU Performance</div>
      <div class="row"><span>Performance state</span><span class="pill">Normal Performance</span></div>
      <div class="row"><span>Processor performance</span><span class="pill">86%</span></div>
      <div class="row"><span>Reported maximum clock</span><span class="pill">3200 MHz</span></div>
      <div class="row"><span>Frequency level</span><span class="pill">75%</span></div>
      <div class="row"><span>Frequency reduction</span><span class="pill">25%</span></div>
      <div class="row"><span>Performance limit</span><span class="pill">100%</span></div>
      <div class="source">Telemetry source: Windows ProcessorInformation _Total</div>

      <div class="label">System</div>
      <div class="row"><span>Network</span><span class="pill">Connected</span></div>
      <div class="row"><span>Uptime</span><span class="pill">2d 4h 8m</span></div>
      <div class="row"><span>CPU</span><span class="pill">Intel Core Ultra 7</span></div>

      <div class="label">Important processes</div>
      <div class="row"><span><i class="dot on"></i>Codex</span><span class="pill">412 MB</span></div>
      <div class="row"><span><i class="dot on"></i>Node</span><span class="pill">295 MB</span></div>
      <div class="row"><span><i class="dot on"></i>Cloudflare Tunnel</span><span class="pill">31 MB</span></div>
    `

    expect(parseMonitorHtml(html)).toMatchObject({
      health: "HEALTHY",
      healthMessage: "Laptop is running normally",
      cpuLoad: 21,
      cpuFreqMhz: 2394,
      cpuMaxMhz: 3200,
      cpuPerformancePercent: 86,
      cpuFrequencyPercent: 75,
      cpuFrequencyReductionPercent: 25,
      cpuPerformanceLimitPercent: 100,
      performanceState: "Normal Performance",
      telemetrySource: "Windows ProcessorInformation _Total",
      memoryPercent: 62,
      memoryUsedGb: 4.55,
      memoryTotalGb: 7.33,
      network: "Connected",
      uptime: "2d 4h 8m",
      cpuName: "Intel Core Ultra 7",
      codexRunning: true,
      codexRamMb: 412,
      nodeRunning: true,
      nodeRamMb: 295,
      cloudflareRunning: true,
      cloudflareRamMb: 31,
    })
  })
})
