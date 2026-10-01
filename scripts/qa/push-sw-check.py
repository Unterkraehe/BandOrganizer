"""Push notifications: delivers a push message to the real service worker and checks the notification that appears.

Needs Chromium's new headless mode (channel='chromium') – the old one shows no notifications.
"""
import json
import sys

from common import BASE, log, session

with session(query='', demo=False, mobile=False, channel='chromium', permissions=['notifications'], origin=BASE.split('/BandOrganizer')[0]) as s:
    pg, ctx = s.pg, s.ctx
    pg.goto(BASE)
    pg.wait_for_timeout(3000)
    log('service worker:', pg.evaluate('navigator.serviceWorker.ready.then(r => r.active && r.active.state)'))
    cdp = s.cdp_session()
    regs = []
    cdp.on('ServiceWorker.workerRegistrationUpdated', lambda e: regs.extend(e['registrations']))
    cdp.send('ServiceWorker.enable')
    pg.wait_for_timeout(1000)
    reg = [r for r in regs if not r.get('isDeleted')][0]
    ctx.new_page().goto('about:blank')
    pg.goto('about:blank')  # no visible app window: the notification must be shown
    pg.wait_for_timeout(500)
    cdp.send('ServiceWorker.deliverPushMessage', {
        'origin': BASE.split('/BandOrganizer')[0],
        'registrationId': reg['registrationId'],
        'data': json.dumps({'title': 'Lisa · Overload', 'body': 'Probe heute 30 min später?', 'url': 'chat?message=c_1', 'tag': 'chat-c_1'}),
    })
    pg.wait_for_timeout(1500)
    pg.goto(BASE)
    pg.wait_for_timeout(1500)
    shown = pg.evaluate('navigator.serviceWorker.ready.then(r => r.getNotifications()).then(ns => ns.map(n => [n.title, n.body, n.tag, n.data && n.data.url]))')
    log('notifications:', shown)
    sys.exit(0 if shown == [['Lisa · Overload', 'Probe heute 30 min später?', 'chat-c_1', 'chat?message=c_1']] else 1)
