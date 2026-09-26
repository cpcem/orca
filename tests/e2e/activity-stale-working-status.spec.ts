import { test, expect } from './helpers/orca-app'
import { ensureTerminalVisible, waitForActiveWorktree, waitForSessionReady } from './helpers/store'
import { waitForActiveTerminalManager, waitForPaneIdentitySnapshot } from './helpers/terminal'

test('activity distinguishes fresh, stale, unconfirmed and completed turns', async ({ orcaPage }, testInfo) => {
  await waitForSessionReady(orcaPage)
  await waitForActiveWorktree(orcaPage)
  await ensureTerminalVisible(orcaPage)
  await waitForActiveTerminalManager(orcaPage, 30_000)
  const snapshot = await waitForPaneIdentitySnapshot(orcaPage, 1)
  const pane = snapshot.panes[0]
  if (!pane) throw new Error('Missing isolated fixture pane')
  const paneKey = `${snapshot.tabId}:${pane.leafId}`
  await orcaPage.evaluate(async () => {
    const settings = await window.api.settings.set({ agentsSidebarIntroShown: true })
    window.__store?.setState({ settings })
  })

  const seed = async (mode: 'fresh' | 'stale' | 'unconfirmed' | 'done') => {
    await orcaPage.evaluate(({ paneKey, tabId, mode }) => {
      const store = window.__store
      if (!store) throw new Error('Missing isolated renderer store')
      const current = store.getState()
      const at = Date.now() - (mode === 'stale' ? 60 * 60_000 : 0)
      store.setState({
        agentStatusByPaneKey: {
          [paneKey]: {
            paneKey,
            tabId,
            state: mode === 'done' ? 'done' : 'working',
            agentType: 'omp',
            prompt: 'CEM555 isolated status fixture',
            updatedAt: at,
            stateStartedAt: at,
            restoredUnconfirmed: mode === 'unconfirmed',
            stateHistory: [{
              state: 'done',
              prompt: 'CEM555 isolated status fixture',
              startedAt: at - 60_000
            }]
          }
        },
        retainedAgentsByPaneKey: {},
        agentStatusEpoch: current.agentStatusEpoch + 1
      })
    }, { paneKey, tabId: snapshot.tabId, mode })
  }

  await seed('fresh')
  await orcaPage.getByRole('button', { name: 'View activity', exact: true }).click()
  const row = orcaPage.getByRole('listitem', { name: 'CEM555 isolated status fixture', exact: true })
  const expectState = async (label: string) => {
    await expect(row).toHaveCount(1)
    await expect(row.getByLabel(label, { exact: true })).toBeVisible()
  }
  await expectState('Working')
  await seed('stale')
  await expectState('No recent update')
  await orcaPage.screenshot({ path: testInfo.outputPath('stale-status.png') })
  await seed('unconfirmed')
  await expectState('No recent update')
  await seed('fresh')
  await expectState('Working')
  await seed('done')
  await expectState('Done')
})
