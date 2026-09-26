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
              startedAt: at - 60_000,
              observedAt: at - 60_000
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
  await expect(orcaPage.getByText('Working', { exact: true }).first()).toBeVisible()
  await seed('stale')
  await orcaPage.screenshot({ path: testInfo.outputPath('stale-status.png') })
  await expect(orcaPage.getByText('No recent update', { exact: true }).first()).toBeVisible()
  await seed('unconfirmed')
  await expect(orcaPage.getByText('No recent update', { exact: true }).first()).toBeVisible()
  await seed('fresh')
  await expect(orcaPage.getByText('Working', { exact: true }).first()).toBeVisible()
  await seed('done')
  await expect(orcaPage.getByText('Done', { exact: true }).first()).toBeVisible()
})
