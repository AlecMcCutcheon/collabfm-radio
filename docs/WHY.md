# Why the defaults are strict

This page explains the **design rationale** behind CollabFM’s conservative content-policy defaults. It is not legal advice and does not describe guarantees about what the software will or will not block.

---

A fair question: if CollabFM already says “don’t stream what you don’t have rights to,” why lock things down by default? Why not leave it wide open and trust people?

Honestly, **a warning alone isn’t enough.** If you publish software that makes it easy to broadcast audio to a room full of friends, you take on some responsibility to reduce predictable misuse—not because CollabFM can solve copyright for everyone, but because doing nothing beyond a disclaimer would be careless. That doesn’t mean pretending we can detect licenses in the audio itself. Fingerprinting, legal verification, and “real” copyright enforcement are out of scope for a self-hosted project like this, and they always will be.

What *is* in scope is **metadata-based, best-effort filtering**: reported source, track info, and—where the extension can read it—license data. That’s imperfect, but it’s a practical guardrail. It catches a lot of accidental “I didn’t think about it” cases, slows down casual misuse, and gives admins a knob without claiming to be a lawyer in a box.

The defaults also reflect what I want the project to *feel* like. CollabFM is for friends sharing a station, not for handing someone a pipe and saying “go stream whatever from wherever.” I don’t want to point you at a catalog, let you go live in two clicks, and set you up for a copyright strike you didn’t see coming. That isn’t the spirit of this project. I’d rather you start from a conservative baseline—sources where the extension can read license metadata, clear license links when reported, policy notices when something isn’t allowed—and **opt in** to broader rules once you understand what you’re taking on.

If the defaults feel tight for your instance, you can change them. That’s intentional. The goal isn’t to punish curious admins; it’s to give everyone the best chance of using CollabFM responsibly and actually enjoying it.

For neutral legal disclaimers and operator responsibilities, see [Legal & responsible use](../README.md#legal--responsible-use) in the README and [Content Policy (wiki)](./wiki/Content-Policy.md).
