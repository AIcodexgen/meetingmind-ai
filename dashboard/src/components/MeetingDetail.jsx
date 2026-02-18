import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { 
  Play, Pause, Download, Share2, CheckCircle, 
  MoreVertical, FileText, Users, Clock 
} from 'lucide-react';
import { format } from 'date-fns';
import { getMeeting, generateShareLink } from '../api/meetings';

export const MeetingDetail = () => {
  const { id } = useParams();
  const [meeting, setMeeting] = useState(null);
  const [activeTab, setActiveTab] = useState('transcript');
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    loadMeeting();
  }, [id]);

  const loadMeeting = async () => {
    const data = await getMeeting(id);
    setMeeting(data);
  };

  if (!meeting) return <div className="flex items-center justify-center h-screen">Loading...</div>;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{meeting.title}</h1>
              <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                <span className="flex items-center gap-1">
                  <Clock size={16} />
                  {format(new Date(meeting.createdAt), 'MMM d, yyyy • h:mm a')}
                </span>
                <span className="capitalize bg-gray-100 px-2 py-1 rounded">
                  {meeting.platform}
                </span>
                <span className="flex items-center gap-1">
                  <Users size={16} />
                  {meeting.participants?.length || 2} participants
                </span>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <button 
                onClick={() => generateShareLink(id)}
                className="flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                <Share2 size={18} />
                Share
              </button>
              <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                <Download size={18} />
                Export
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8 grid grid-cols-3 gap-8">
        {/* Main Content */}
        <div className="col-span-2 space-y-6">
          {/* Tabs */}
          <div className="bg-white rounded-lg shadow-sm border">
            <div className="flex border-b">
              {['transcript', 'summary', 'action-items', 'recording'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-6 py-3 text-sm font-medium capitalize border-b-2 ${
                    activeTab === tab 
                      ? 'border-blue-600 text-blue-600' 
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {tab.replace('-', ' ')}
                </button>
              ))}
            </div>

            <div className="p-6">
              {activeTab === 'transcript' && (
                <div className="space-y-4 max-h-[600px] overflow-y-auto">
                  {meeting.transcripts?.map((item) => (
                    <div key={item.id} className="flex gap-4 p-3 hover:bg-gray-50 rounded-lg">
                      <div className="w-24 flex-shrink-0 text-sm text-gray-400 font-mono">
                        {format(new Date(item.timestamp), 'HH:mm:ss')}
                      </div>
                      <div className="flex-1">
                        <span className="font-semibold text-blue-600 block mb-1">
                          {item.speaker}
                        </span>
                        <p className="text-gray-700 leading-relaxed">{item.content}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === 'summary' && meeting.summary && (
                <div className="prose max-w-none">
                  <div className="mb-6">
                    <h3 className="text-lg font-semibold mb-3">Executive Summary</h3>
                    <p className="text-gray-700 leading-relaxed">{meeting.summary.summary}</p>
                  </div>
                  
                  <div className="mb-6">
                    <h3 className="text-lg font-semibold mb-3">Key Points</h3>
                    <ul className="space-y-2">
                      {meeting.summary.keyPoints?.map((point, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-gray-700">
                          <span className="text-blue-600 mt-1">•</span>
                          {point}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <h3 className="text-lg font-semibold mb-3">Decisions Made</h3>
                    <div className="grid gap-3">
                      {meeting.summary.decisions?.map((decision, idx) => (
                        <div key={idx} className="bg-green-50 border border-green-200 rounded-lg p-4">
                          <div className="flex items-start gap-3">
                            <CheckCircle className="text-green-600 mt-0.5" size={18} />
                            <span className="text-gray-800">{decision}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'action-items' && (
                <div className="space-y-3">
                  {meeting.actionItems?.map((item) => (
                    <div key={item.id} className="flex items-center justify-between p-4 bg-white border rounded-lg hover:shadow-sm transition-shadow">
                      <div className="flex items-start gap-3">
                        <input 
                          type="checkbox" 
                          checked={item.status === 'COMPLETED'}
                          className="mt-1 w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
                        />
                        <div>
                          <p className="font-medium text-gray-900">{item.task}</p>
                          <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                            <span className="flex items-center gap-1">
                              <Users size={14} />
                              {item.owner || 'Unassigned'}
                            </span>
                            {item.deadline && (
                              <span className="flex items-center gap-1 text-orange-600">
                                <Clock size={14} />
                                Due {format(new Date(item.deadline), 'MMM d')}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <button className="p-2 hover:bg-gray-100 rounded">
                        <MoreVertical size={18} className="text-gray-400" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Quick Stats */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Meeting Stats</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Duration</span>
                <span className="font-medium">{Math.floor(meeting.duration / 60)}m {meeting.duration % 60}s</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Words</span>
                <span className="font-medium">
                  {meeting.transcripts?.reduce((acc, t) => acc + t.content.split(' ').length, 0)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Action Items</span>
                <span className="font-medium">{meeting.actionItems?.length || 0}</span>
              </div>
            </div>
          </div>

          {/* Integrations */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Integrations</h3>
            <div className="space-y-3">
              <button className="w-full flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50">
                <span className="flex items-center gap-2">
                  <img src="/hubspot-logo.svg" alt="" className="w-5 h-5" />
                  <span className="text-sm font-medium">HubSpot</span>
                </span>
                <span className="text-xs text-green-600 font-medium">Synced</span>
              </button>
              <button className="w-full flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50">
                <span className="flex items-center gap-2">
                  <img src="/slack-logo.svg" alt="" className="w-5 h-5" />
                  <span className="text-sm font-medium">Slack</span>
                </span>
                <span className="text-xs text-gray-400">Connect</span>
              </button>
            </div>
          </div>

          {/* AI Insights */}
          {meeting.summary?.sentiment && (
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg border border-blue-100 p-6">
              <h3 className="font-semibold text-blue-900 mb-2">AI Insights</h3>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-2xl">
                  {meeting.summary.sentiment === 'POSITIVE' ? '😊' : 
                   meeting.summary.sentiment === 'NEGATIVE' ? '😟' : '😐'}
                </span>
                <span className="text-sm text-blue-800 font-medium">
                  {meeting.summary.sentiment} sentiment
                </span>
              </div>
              <p className="text-sm text-blue-700">
                This meeting had a productive tone with clear action items assigned.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
