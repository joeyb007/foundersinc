# Realtime chat for Founders Inc

Members currently coordinate over email and lose the thread within a day. They
need a live chat surface inside the portal — message history that survives a
refresh, presence so you know who is around, and typing indicators so a reply
in progress doesn't get talked over. The whole thing has to stay usable on a
flaky conference-wifi connection.

## Message thread view

Render the message list for a room, grouping consecutive messages from the same
author into a single block. Keep the scroll pinned to the newest message unless
the reader has scrolled up, in which case show a "jump to latest" affordance
instead of yanking them down. Virtualize the list so a room with ten thousand
messages still scrolls at sixty frames per second.

## WebSocket gateway

Expose a `/ws` endpoint that authenticates on connect, subscribes the socket to
its room, and fans inbound messages out to every other subscriber. Reconnect
with exponential backoff — 250ms doubling to a 8s ceiling, jittered — and
replay anything missed during the gap so a dropped connection is invisible to
the reader. Rate limit inbound messages per session.

## Presence and typing state

Model who is online per room as a TTL keyed on the pair of room and member, and
expire typing state after three seconds of silence. Queries against this store
run on every keystroke across every open tab, so it has to be cheap to read and
cheap to write.

## Toxicity filter on inbound messages

Score each inbound message before it is broadcast and hold anything above the
threshold for human review rather than showing it and retracting it. The
threshold has to be configurable per room — what reads as heated in one channel
is normal in another.

## Composer

A text input that grows to four lines and then scrolls, sends on Enter, and
inserts a newline on Shift-Enter. Accept dragged images as attachments, showing
each as a thumbnail with a remove control before the message is sent.

## Message retention

Roll messages older than ninety days into cold storage on a nightly schedule,
leaving a marker in the thread so the reader understands the history continues
rather than simply ending.
