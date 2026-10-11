import { mount } from '@vue/test-utils'
import { describe, it, expect, vi } from 'vitest'
import { createTestingPinia } from '@pinia/testing'
import { ref } from 'vue'
import ZoneNode from '../src/components/flow/ZoneNode.vue'
import ZoneMapFeaturesModal from '../src/components/flow/zone/ZoneMapFeaturesModal.vue'

vi.mock('../src/utils/roomOperations', () => ({
  deleteConnection: vi.fn(),
  deleteConnections: vi.fn(),
  deleteNode: vi.fn(),
  updateConnection: vi.fn(),
  addConnection: vi.fn(),
}))

const ICON = '/images/brecilien-portal.png'

describe('Brecilien portal map feature', () => {
  const mountNode = (features: Record<string, unknown>) =>
    mount(ZoneNode as any, {
      props: {
        id: 'test-node',
        type: 'zone',
        data: { type: 'roads', tier: 5, zoneName: 'Test Zone', features },
        selected: false,
        dragging: false,
        resizing: false,
        connectable: true,
        zIndex: 0,
        position: { x: 0, y: 0 },
        dimensions: { width: 160, height: 100 },
        events: {} as any,
      },
      global: {
        plugins: [createTestingPinia({ createSpy: vi.fn })],
        provide: { globalNow: ref(Date.now()) },
        stubs: { Handle: true, TagTier: true, TagZone: true },
      },
    })

  it('shows the portal icon on the node when the flag is set', () => {
    const wrapper = mountNode({ brecilienPortalPresent: true })
    expect(wrapper.findAll(`img[src="${ICON}"]`).length).toBeGreaterThan(0)
  })

  it('does not show the portal icon when the flag is absent', () => {
    const wrapper = mountNode({ crystalCreaturePresent: true })
    expect(wrapper.find(`img[src="${ICON}"]`).exists()).toBe(false)
  })

  it('emits the toggle from the map features editor', async () => {
    const wrapper = mount(ZoneMapFeaturesModal as any, {
      props: { isOpen: true, hasReds: false, features: {} },
    })

    const button = wrapper.findAll('button').find(b => b.attributes('title') === 'Brecilien Portal')
    expect(button).toBeDefined()

    await button!.trigger('click')
    expect(wrapper.emitted('toggle')?.[0]).toEqual(['brecilienPortalPresent'])
  })
})
