import React from 'react';
import './TrainingDetailsModal.css';

const TrainingDetailsModal = ({ isOpen, onClose, training }) => {
  if (!isOpen || !training) return null;

  const getTrainingAdvice = (trainingType) => {
    const advice = {
      endurance: {
        title: "Endurance Training",
        description: "Long rides for aerobic base development and overall endurance improvement.",
        technical_aspects: [
          "Maintain steady pace throughout the entire workout",
          "Keep cadence 80-90 rpm for optimal efficiency",
          "Control heart rate in zones 2-3 (60-75% of maximum)",
          "Avoid sudden accelerations and decelerations"
        ],
        tips: [
          "Start with 10-15 minute warm-up at easy pace",
          "Drink water every 15-20 minutes",
          "Plan route with minimal stops",
          "Use even effort distribution"
        ],
        common_mistakes: [
          "Too high intensity at the beginning",
          "Insufficient fluid intake",
          "Irregular pace",
          "Ignoring fatigue signals"
        ]
      },
      tempo: {
        title: "Tempo Training",
        description: "Threshold zone workouts to improve ability to maintain high speed.",
        technical_aspects: [
          "Maintain intensity 85-95% of FTP",
          "Cadence 85-95 rpm for optimal power",
          "Heart rate in zone 4 (85-95% of maximum)",
          "Focus on pedaling technique"
        ],
        tips: [
          "Thorough 20-30 minute warm-up",
          "Start with short intervals and increase duration",
          "Monitor breathing - should be deep but controlled",
          "Use flat sections or gentle climbs"
        ],
        common_mistakes: [
          "Too high intensity at the beginning",
          "Insufficient warm-up",
          "Ignoring pedaling technique",
          "Too long intervals without experience"
        ]
      },
      intervals: {
        title: "Interval Training",
        description: "High-intensity intervals to improve VO2max and anaerobic endurance.",
        technical_aspects: [
          "Intensity 105-120% of FTP during work",
          "Cadence 90-100 rpm in work intervals",
          "Heart rate in zone 5 (95-105% of maximum)",
          "Complete recovery between intervals"
        ],
        tips: [
          "Mandatory 30-40 minute warm-up",
          "Start with short intervals (30 sec - 2 min)",
          "Monitor recovery quality between intervals",
          "Use hills or ergometer for load control"
        ],
        common_mistakes: [
          "Insufficient warm-up",
          "Too short recovery",
          "Quality decline in final intervals",
          "Ignoring technique under fatigue"
        ]
      },
      sweet_spot: {
        title: "Sweet Spot Training",
        description: "Workouts in optimal zone for FTP improvement without excessive stress.",
        technical_aspects: [
          "Intensity 88-93% of FTP",
          "Cadence 85-95 rpm",
          "Heart rate in zones 3-4 (75-85% of maximum)",
          "Steady pace without fluctuations"
        ],
        tips: [
          "15-20 minute warm-up",
          "Use flat sections or gentle climbs",
          "Monitor pedaling technique",
          "Plan route with minimal stops"
        ],
        common_mistakes: [
          "Too high intensity",
          "Insufficient warm-up",
          "Irregular pace",
          "Ignoring recovery"
        ]
      },
      recovery: {
        title: "Recovery Training",
        description: "Easy rides to accelerate recovery and maintain fitness.",
        technical_aspects: [
          "Intensity 50-65% of FTP",
          "Cadence 70-80 rpm",
          "Heart rate in zones 1-2 (50-70% of maximum)",
          "Comfortable pace without strain"
        ],
        tips: [
          "Short 5-10 minute warm-up",
          "Choose flat routes without climbs",
          "Monitor pedaling technique",
          "Avoid group rides"
        ],
        common_mistakes: [
          "Too high intensity",
          "Too long workout",
          "Complex route with climbs",
          "Ignoring fatigue signals"
        ]
      },
      hill_climbing: {
        title: "Hill Climbing Training",
        description: "Specific workouts to improve uphill riding skills and leg strength.",
        technical_aspects: [
          "Intensity 80-110% of FTP on climbs",
          "Cadence 60-80 rpm on climbs",
          "Heart rate in zones 3-5 (75-95% of maximum)",
          "Standing and sitting technique"
        ],
        tips: [
          "Thorough 20-30 minute warm-up",
          "Start with short climbs",
          "Alternate standing and sitting positions",
          "Monitor pedaling technique"
        ],
        common_mistakes: [
          "Too high intensity",
          "Poor pedaling technique",
          "Insufficient warm-up",
          "Ignoring recovery"
        ]
      },
      sprint: {
        title: "Sprint Training",
        description: "Short maximum efforts for explosive power and speed development.",
        technical_aspects: [
          "Intensity 130-150% of FTP",
          "Cadence 100-120 rpm",
          "Heart rate in zone 5+ (95-100% of maximum)",
          "Maximum power in short intervals"
        ],
        tips: [
          "Mandatory 25-30 minute warm-up",
          "Start with short sprints (10-15 sec)",
          "Complete recovery between sprints",
          "Focus on technique and power"
        ],
        common_mistakes: [
          "Insufficient warm-up",
          "Too long sprints",
          "Insufficient recovery",
          "Poor technique under fatigue"
        ]
      },
      threshold: {
        title: "Threshold Training",
        description: "Workouts at lactate threshold level to improve FTP and sustained power.",
        technical_aspects: [
          "Intensity 95-105% of FTP",
          "Cadence 85-95 rpm",
          "Heart rate in zone 4 (85-95% of maximum)",
          "Steady effort without fluctuations"
        ],
        tips: [
          "20-30 minute warm-up",
          "Start with shorter intervals (10-15 min)",
          "Monitor breathing and effort",
          "Use flat sections or gentle climbs"
        ],
        common_mistakes: [
          "Too high intensity",
          "Insufficient warm-up",
          "Irregular pace",
          "Ignoring recovery"
        ]
      },
      over_under: {
        title: "Over/Under Training",
        description: "Alternating efforts above and below threshold for FTP improvement.",
        technical_aspects: [
          "Over: 105-115% of FTP, Under: 85-95% of FTP",
          "Cadence 85-95 rpm",
          "Heart rate in zones 4-5",
          "Smooth transitions between intensities"
        ],
        tips: [
          "20-30 minute warm-up",
          "Start with 2-3 minute intervals",
          "Monitor transitions between efforts",
          "Use ergometer for precise control"
        ],
        common_mistakes: [
          "Too abrupt transitions",
          "Insufficient warm-up",
          "Poor recovery between sets",
          "Ignoring technique"
        ]
      },
      pyramid: {
        title: "Pyramid Training",
        description: "Progressive intensity intervals to develop various energy systems.",
        technical_aspects: [
          "Intensity 90-120% of FTP",
          "Cadence 85-100 rpm",
          "Heart rate in zones 3-5",
          "Progressive effort structure"
        ],
        tips: [
          "20-30 minute warm-up",
          "Follow pyramid structure exactly",
          "Equal recovery between intervals",
          "Monitor effort progression"
        ],
        common_mistakes: [
          "Incorrect pyramid structure",
          "Insufficient warm-up",
          "Poor recovery management",
          "Ignoring fatigue signals"
        ]
      },
      cadence: {
        title: "Cadence Training",
        description: "Workouts to improve pedaling technique and efficiency.",
        technical_aspects: [
          "Intensity 70-85% of FTP",
          "Cadence 100-120 rpm",
          "Heart rate in zones 2-3",
          "Focus on smooth pedaling"
        ],
        tips: [
          "15-20 minute warm-up",
          "Start with shorter intervals",
          "Focus on pedaling technique",
          "Use flat sections"
        ],
        common_mistakes: [
          "Too high intensity",
          "Poor pedaling technique",
          "Insufficient warm-up",
          "Ignoring form"
        ]
      },
      strength: {
        title: "Strength Training",
        description: "Low cadence workouts to develop leg strength and power.",
        technical_aspects: [
          "Intensity 80-95% of FTP",
          "Cadence 50-70 rpm",
          "Heart rate in zones 3-4",
          "Focus on power output"
        ],
        tips: [
          "20-30 minute warm-up",
          "Use hills or ergometer",
          "Maintain good form",
          "Monitor knee stress"
        ],
        common_mistakes: [
          "Too high intensity",
          "Poor form",
          "Insufficient warm-up",
          "Ignoring knee stress"
        ]
      },
      time_trial: {
        title: "Time Trial Training",
        description: "Race simulation to test current fitness and develop race pace.",
        technical_aspects: [
          "Intensity 95-105% of FTP",
          "Cadence 85-95 rpm",
          "Heart rate in zone 4",
          "Steady race pace"
        ],
        tips: [
          "20-30 minute warm-up",
          "Plan route with minimal stops",
          "Practice nutrition strategy",
          "Monitor pacing"
        ],
        common_mistakes: [
          "Too fast start",
          "Poor pacing",
          "Insufficient warm-up",
          "Ignoring nutrition"
        ]
      },
      group_ride: {
        title: "Group Ride Training",
        description: "Social training sessions to develop group riding skills.",
        technical_aspects: [
          "Intensity 70-90% of FTP",
          "Cadence 80-95 rpm",
          "Heart rate in zones 2-4",
          "Group dynamics and positioning"
        ],
        tips: [
          "15-20 minute warm-up",
          "Practice group positioning",
          "Communicate with group",
          "Follow group pace"
        ],
        common_mistakes: [
          "Poor positioning",
          "Ignoring group dynamics",
          "Insufficient warm-up",
          "Poor communication"
        ]
      }
    };

    return advice[trainingType] || advice.endurance;
  };

  const advice = getTrainingAdvice(training.type);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{advice.title}</h2>
          <button className="modal-close-btn" onClick={onClose}>×</button>
        </div>
        
        <div className="modal-body">
          <div className="training-description">
            <p>{advice.description}</p>
          </div>

          <div className="training-details">
            {training.details && (
              <div className="current-training-info">
                <h4>Training Parameters:</h4>
                <div className="training-params">
                  {training.details.intensity && (
                    <div className="param">
                      <strong>Intensity:</strong> {training.details.intensity}
                    </div>
                  )}
                  {training.details.duration && (
                    <div className="param">
                      <strong>Duration:</strong> {training.details.duration}
                    </div>
                  )}
                  {training.details.cadence && (
                    <div className="param">
                      <strong>Cadence:</strong> {training.details.cadence}
                    </div>
                  )}
                  {training.details.hr_zones && (
                    <div className="param">
                      <strong>Heart Rate Zones:</strong> {training.details.hr_zones}
                    </div>
                  )}
                </div>
              </div>
            )}
          <div className="modal-content-cards">
          {training.details?.structure && (
              <div className="training-structure">
                <h4>Workout Structure:</h4>
                <div className="structure-parts">
                  {Object.entries(training.details.structure).map(([part, description]) => (
                    <div key={part} className="structure-part">
                      <strong>{part === 'warmup' ? 'Warm-up' : 
                              part === 'main' ? 'Main Part' : 
                              part === 'cooldown' ? 'Cool-down' : part}:</strong>
                      <span>{description}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="technical-aspects">
              <h4>Technical Aspects:</h4>
              <ul>
                {advice.technical_aspects.map((aspect, index) => (
                  <li key={index}>{aspect}</li>
                ))}
              </ul>
            </div>

            <div className="training-tips">
              <h4>Tips:</h4>
              <ul>
                {advice.tips.map((tip, index) => (
                  <li key={index}>{tip}</li>
                ))}
              </ul>
            </div>

            <div className="common-mistakes">
              <h4>Common Mistakes:</h4>
              <ul>
                {advice.common_mistakes.map((mistake, index) => (
                  <li key={index}>{mistake}</li>
                ))}
              </ul>
            </div>

           
          </div>
           
          </div>
        </div>
      </div>
    </div>
  );
};

export default TrainingDetailsModal; 