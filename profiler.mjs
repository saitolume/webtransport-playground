import osu from 'node-os-utils'

let second = 0

setInterval(async () => {
  const cpuUsage = await osu.cpu.usage()
  const { usedMemMb, totalMemMb } = await osu.mem.used()
  const memUsage = (usedMemMb / totalMemMb) * 100
  console.log(`${second}, ${cpuUsage.toFixed(2)}, ${memUsage.toFixed(2)}`)
  second++
}, 1000)
