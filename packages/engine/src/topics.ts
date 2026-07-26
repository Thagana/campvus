// Derives a course's swarm topic key. Hashing the course ID (rather than
// joining the raw ID) avoids leaking plaintext course identifiers to the
// wider DHT.

import crypto from 'crypto'

export function topicForCourse (courseId: string): Buffer {
  return crypto.createHash('sha256').update('campus-p2p-course:' + courseId).digest()
}
