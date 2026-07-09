const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const ChatRequest = require('../models/ChatRequest');
const User = require('../models/User');
const env = require('../config/env');
const { isAdminRole } = require('../utils/roles');

function requireMongo() {
  if (!env.mongoUri) throw new Error('MongoDB is required for team chat');
}

function memberIds(conversation) {
  return conversation.members.map((m) => m.userId.toString());
}

function isMember(conversation, userId) {
  return memberIds(conversation).includes(userId.toString());
}

async function listContacts(userId) {
  requireMongo();
  const users = await User.find({ active: true, _id: { $ne: userId } })
    .select('name email role')
    .sort({ name: 1 })
    .lean();
  return users.map((u) => ({ id: u._id, name: u.name, email: u.email, role: u.role }));
}

async function listIncomingRequests(userId) {
  requireMongo();
  const requests = await ChatRequest.find({ toUserId: userId, status: 'pending' })
    .sort({ createdAt: -1 })
    .populate('fromUserId', 'name email')
    .populate('conversationId', 'name type')
    .lean();
  return requests.map((r) => ({
    id: r._id,
    type: r.type,
    introMessage: r.introMessage,
    from: r.fromUserId ? { id: r.fromUserId._id, name: r.fromUserId.name, email: r.fromUserId.email } : null,
    conversation: r.conversationId
      ? { id: r.conversationId._id, name: r.conversationId.name, type: r.conversationId.type }
      : null,
    createdAt: r.createdAt,
  }));
}

async function sendDmRequest(fromUserId, toUserId, introMessage = '') {
  requireMongo();
  if (fromUserId.toString() === toUserId.toString()) throw new Error('Cannot message yourself');

  const existing = await Conversation.findOne({
    type: 'dm',
    'members.userId': { $all: [fromUserId, toUserId] },
    $expr: { $eq: [{ $size: '$members' }, 2] },
  });
  if (existing) throw new Error('You already have a conversation with this user');

  const pending = await ChatRequest.findOne({
    fromUserId,
    toUserId,
    status: 'pending',
    type: 'dm',
  });
  if (pending) throw new Error('Request already pending');

  const toUser = await User.findById(toUserId);
  if (!toUser || !toUser.active) throw new Error('User not found');

  const fromUser = await User.findById(fromUserId);
  const request = await ChatRequest.create({
    fromUserId,
    toUserId,
    type: 'dm',
    introMessage: introMessage.trim(),
  });

  try {
    const emailService = require('./emailService');
    await emailService.notifyChatInvite(toUserId, {
      fromName: fromUser?.name || 'A teammate',
      intro: introMessage.trim(),
    });
  } catch {
    /* optional */
  }

  return request;
}

async function acceptRequest(requestId, userId) {
  requireMongo();
  const request = await ChatRequest.findById(requestId);
  if (!request || request.toUserId.toString() !== userId.toString()) {
    throw new Error('Request not found');
  }
  if (request.status !== 'pending') throw new Error('Request already handled');

  const fromUser = await User.findById(request.fromUserId);
  if (!fromUser) throw new Error('Sender not found');

  request.status = 'accepted';
  await request.save();

  if (request.type === 'group' && request.conversationId) {
    const conversation = await Conversation.findById(request.conversationId);
    if (!conversation) throw new Error('Group not found');
    if (!isMember(conversation, userId)) {
      conversation.members.push({ userId, role: 'member' });
      await conversation.save();
      await Message.create({
        conversationId: conversation._id,
        senderId: userId,
        senderName: (await User.findById(userId))?.name || 'User',
        content: `joined the group`,
        type: 'system',
      });
    }
    return { conversationId: conversation._id, type: 'group' };
  }

  const conversation = await Conversation.create({
    type: 'dm',
    members: [
      { userId: request.fromUserId, role: 'member' },
      { userId: request.toUserId, role: 'member' },
    ],
    createdBy: request.fromUserId,
  });

  if (request.introMessage) {
    await Message.create({
      conversationId: conversation._id,
      senderId: request.fromUserId,
      senderName: fromUser.name,
      content: request.introMessage,
      type: 'text',
    });
    conversation.lastMessagePreview = request.introMessage.slice(0, 120);
    conversation.lastMessageAt = new Date();
    await conversation.save();
  }

  return { conversationId: conversation._id, type: 'dm' };
}

async function declineRequest(requestId, userId) {
  requireMongo();
  const request = await ChatRequest.findById(requestId);
  if (!request || request.toUserId.toString() !== userId.toString()) {
    throw new Error('Request not found');
  }
  request.status = 'declined';
  await request.save();
}

async function createGroup(creatorId, name, memberIds) {
  requireMongo();
  const uniqueIds = [...new Set(memberIds.map((id) => id.toString()))].filter(
    (id) => id !== creatorId.toString()
  );
  if (!uniqueIds.length) throw new Error('Add at least one other member');

  const creator = await User.findById(creatorId);
  const conversation = await Conversation.create({
    type: 'group',
    name: name.trim() || 'Group chat',
    members: [{ userId: creatorId, role: 'admin' }],
    createdBy: creatorId,
    lastMessagePreview: `${creator?.name || 'Someone'} created the group`,
  });

  await Message.create({
    conversationId: conversation._id,
    senderId: creatorId,
    senderName: creator?.name || 'User',
    content: `created "${conversation.name}"`,
    type: 'system',
  });

  for (const toUserId of uniqueIds) {
    await ChatRequest.create({
      fromUserId: creatorId,
      toUserId,
      conversationId: conversation._id,
      type: 'group',
      introMessage: `Invited you to "${conversation.name}"`,
    });
  }

  return conversation;
}

async function listConversations(userId) {
  requireMongo();
  const conversations = await Conversation.find({ 'members.userId': userId })
    .sort({ lastMessageAt: -1 })
    .lean();

  const userIds = new Set();
  conversations.forEach((c) => c.members.forEach((m) => userIds.add(m.userId.toString())));
  const users = await User.find({ _id: { $in: [...userIds] } }).select('name email').lean();
  const userMap = new Map(users.map((u) => [u._id.toString(), u]));

  return conversations.map((c) => {
    const otherMembers = c.members
      .filter((m) => m.userId.toString() !== userId.toString())
      .map((m) => userMap.get(m.userId.toString()))
      .filter(Boolean);

    const title =
      c.type === 'group'
        ? c.name
        : otherMembers[0]?.name || 'Direct message';

    return {
      id: c._id,
      type: c.type,
      title,
      jobId: c.jobId,
      jobTitle: c.jobTitle,
      company: c.company,
      squadType: c.squadType,
      members: c.members.map((m) => ({
        id: m.userId,
        name: userMap.get(m.userId.toString())?.name,
        role: m.role,
      })),
      lastMessagePreview: c.lastMessagePreview,
      lastMessageAt: c.lastMessageAt,
    };
  });
}

async function getMessages(conversationId, userId) {
  requireMongo();
  const conversation = await Conversation.findById(conversationId);
  if (!conversation || !isMember(conversation, userId)) {
    throw new Error('Conversation not found');
  }
  const messages = await Message.find({ conversationId }).sort({ createdAt: 1 }).limit(200).lean();
  return messages.map((m) => ({
    id: m._id,
    senderId: m.senderId,
    senderName: m.senderName,
    content: m.content,
    type: m.type,
    createdAt: m.createdAt,
  }));
}

async function sendMessage(conversationId, userId, content) {
  requireMongo();
  const conversation = await Conversation.findById(conversationId);
  if (!conversation || !isMember(conversation, userId)) {
    throw new Error('Conversation not found');
  }
  const user = await User.findById(userId);
  const text = content.trim();
  if (!text) throw new Error('Message cannot be empty');

  const message = await Message.create({
    conversationId,
    senderId: userId,
    senderName: user?.name || 'User',
    content: text,
    type: 'text',
  });

  conversation.lastMessagePreview = text.slice(0, 120);
  conversation.lastMessageAt = new Date();
  await conversation.save();

  return {
    id: message._id,
    senderId: message.senderId,
    senderName: message.senderName,
    content: message.content,
    type: message.type,
    createdAt: message.createdAt,
  };
}

async function createApplySquad(creatorId, { jobId, jobTitle, company, memberIds }) {
  requireMongo();
  const creator = await User.findById(creatorId);
  const name = `Squad: ${jobTitle} @ ${company}`;
  const conversation = await Conversation.create({
    type: 'group',
    name,
    jobId,
    jobTitle,
    company,
    squadType: 'apply_squad',
    members: [{ userId: creatorId, role: 'admin' }],
    createdBy: creatorId,
    lastMessagePreview: `Apply squad for ${company}`,
  });

  await Message.create({
    conversationId: conversation._id,
    senderId: creatorId,
    senderName: creator?.name || 'User',
    content: `Apply squad opened for ${jobTitle} at ${company}. Share notes and cover letter drafts here.`,
    type: 'system',
  });

  for (const toUserId of memberIds) {
    if (toUserId.toString() !== creatorId.toString()) {
      await ChatRequest.create({
        fromUserId: creatorId,
        toUserId,
        conversationId: conversation._id,
        type: 'group',
        introMessage: `Join apply squad for ${company}`,
      });
    }
  }
  return conversation;
}

async function addMentor(conversationId, mentorId, requesterId) {
  requireMongo();
  const mentor = await User.findById(mentorId);
  if (!mentor?.isMentor && !isAdminRole(mentor?.role)) throw new Error('User is not a mentor');
  const conversation = await Conversation.findById(conversationId);
  if (!conversation || !isMember(conversation, requesterId)) throw new Error('Conversation not found');
  if (isMember(conversation, mentorId)) return conversation;

  await ChatRequest.create({
    fromUserId: requesterId,
    toUserId: mentorId,
    conversationId: conversation._id,
    type: 'group',
    introMessage: 'Mentor review requested',
  });
  conversation.squadType = conversation.squadType || 'mentor';
  await conversation.save();
  return conversation;
}

async function unreadCounts(userId) {
  requireMongo();
  const [incoming, conversations] = await Promise.all([
    ChatRequest.countDocuments({ toUserId: userId, status: 'pending' }),
    Conversation.countDocuments({ 'members.userId': userId }),
  ]);
  return { pendingRequests: incoming, conversations };
}

async function ensureDirectDm(userA, userB, introMessage = '') {
  requireMongo();
  const existing = await Conversation.findOne({
    type: 'dm',
    'members.userId': { $all: [userA, userB] },
    $expr: { $eq: [{ $size: '$members' }, 2] },
  });
  if (existing) return { conversationId: existing._id };

  const fromUser = await User.findById(userA);
  const conversation = await Conversation.create({
    type: 'dm',
    members: [
      { userId: userA, role: 'member' },
      { userId: userB, role: 'member' },
    ],
    createdBy: userA,
  });

  if (introMessage) {
    await Message.create({
      conversationId: conversation._id,
      senderId: userA,
      senderName: fromUser?.name || 'Teammate',
      content: introMessage,
      type: 'text',
    });
    conversation.lastMessagePreview = introMessage.slice(0, 120);
    conversation.lastMessageAt = new Date();
    await conversation.save();
  }

  return { conversationId: conversation._id };
}

module.exports = {
  listContacts,
  listIncomingRequests,
  sendDmRequest,
  acceptRequest,
  declineRequest,
  createGroup,
  createApplySquad,
  addMentor,
  listConversations,
  ensureDirectDm,
  getMessages,
  sendMessage,
  unreadCounts,
};
