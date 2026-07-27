// Derives a course's swarm topic key. Hashing the course ID (rather than
// joining the raw ID) avoids leaking plaintext course identifiers to the
// wider DHT.

import crypto from 'crypto'

export function topicForCourse (courseId: string): Buffer {
  return crypto.createHash('sha256').update('campus-p2p-course:' + courseId).digest()
}

// Tier 2 (ADR-0006): a second, narrower topic peers join alongside the
// course-wide one above, scoped by an admin-configured region tag rather
// than real geolocation — "nearby but not same LAN" per §8, approximated
// by whoever runs the node setting the same tag (e.g. a residence name).
export function topicForCourseAndRegion (courseId: string, region: string): Buffer {
  return crypto.createHash('sha256').update('campus-p2p-course-region:' + courseId + ':' + region).digest()
}
