// 토플 시험 데이터
const toeflData = {
    reading: {
        passages: [
            {
                id: 1,
                title: "The Industrial Revolution",
                content: `<p>The Industrial Revolution was a period of major industrialization and innovation that took place during the late 1700s and early 1800s. The Industrial Revolution began in Great Britain and quickly spread throughout the world. This time period saw the mechanization of agriculture and textile manufacturing and a revolution in power, including steam ships and railroads, that effected social, cultural and economic conditions.</p>
                
                <p>Before the Industrial Revolution, which began in Britain in the late 1700s, manufacturing was often done in people's homes, using hand tools or basic machines. Industrialization marked a shift to powered, special-purpose machinery, factories and mass production. The iron and textile industries, along with the development of the steam engine, played central roles in the Industrial Revolution, which also saw improved systems of transportation, communication and banking.</p>
                
                <p>While industrialization brought about an increased volume and variety of manufactured goods and an improved standard of living for some, it also resulted in often grim employment and living conditions for the poor and working classes. The transition from an agricultural society to an industrial one was not without challenges. Workers faced long hours in dangerous conditions for low pay. Children as young as six years old were often employed in factories and mines.</p>
                
                <p>The Industrial Revolution also led to unprecedented population growth and urbanization. New manufacturing technologies made it possible to produce goods more efficiently, which lowered their price and made them more available to a wider range of consumers. Cities and towns grew rapidly as people moved from rural areas seeking employment in factories. This migration from countryside to city led to overcrowding, poor sanitation, and the spread of disease in urban areas.</p>`,
                questions: [
                    {
                        id: 1,
                        question: "According to paragraph 1, the Industrial Revolution began in which country?",
                        options: [
                            "The United States",
                            "Great Britain",
                            "France",
                            "Germany"
                        ],
                        correctAnswer: 1
                    },
                    {
                        id: 2,
                        question: "The word 'grim' in paragraph 3 is closest in meaning to",
                        options: [
                            "Pleasant",
                            "Harsh",
                            "Modern",
                            "Temporary"
                        ],
                        correctAnswer: 1
                    },
                    {
                        id: 3,
                        question: "What can be inferred from paragraph 4 about urbanization during the Industrial Revolution?",
                        options: [
                            "It only affected large cities",
                            "It led to improved living conditions for all",
                            "It created public health challenges",
                            "It was carefully planned by governments"
                        ],
                        correctAnswer: 2
                    }
                ]
            },
            {
                id: 2,
                title: "Animal Communication",
                content: `<p>Communication among animals takes many forms, including visual signals, sounds, chemical signals, and touch. While human language is unique in its complexity and symbolic nature, animals have developed sophisticated ways to convey information to members of their own species and sometimes to other species as well.</p>
                
                <p>Visual communication is common among many species. For example, birds display colorful plumage during mating season to attract potential partners. Similarly, some fish change colors to signal aggression or submission. Bees perform elaborate dances to indicate the direction and distance of food sources to other members of their hive. These visual signals are often species-specific and have evolved over millions of years.</p>
                
                <p>Acoustic communication, or the use of sound, is another widespread form of animal communication. Whales and dolphins use complex vocalizations to communicate over long distances in the ocean. Birds sing to establish territories and attract mates. Even insects like crickets use sound, producing chirps by rubbing their wings together. The sophistication of acoustic communication varies greatly among species, with some animals capable of producing and recognizing hundreds of distinct sounds.</p>
                
                <p>Chemical communication through pheromones is particularly important for insects and many mammals. Ants leave chemical trails that other ants can follow to food sources. Dogs and cats use scent marking to establish territories. Some animals can even communicate emotional states through chemical signals. This form of communication has the advantage of persisting in the environment long after the signaling animal has left the area.</p>`,
                questions: [
                    {
                        id: 4,
                        question: "Which of the following is NOT mentioned as a form of animal communication?",
                        options: [
                            "Visual signals",
                            "Electrical impulses",
                            "Chemical signals",
                            "Touch"
                        ],
                        correctAnswer: 1
                    },
                    {
                        id: 5,
                        question: "According to paragraph 3, what is one advantage of acoustic communication for whales and dolphins?",
                        options: [
                            "It attracts prey",
                            "It works over long distances",
                            "It requires less energy than other forms",
                            "It can be understood by all marine species"
                        ],
                        correctAnswer: 1
                    },
                    {
                        id: 6,
                        question: "Why does the author mention that chemical signals can persist in the environment?",
                        options: [
                            "To explain why this form of communication is unreliable",
                            "To show a disadvantage of pheromones",
                            "To highlight an advantage of chemical communication",
                            "To compare it with visual communication"
                        ],
                        correctAnswer: 2
                    }
                ]
            },
            {
                id: 3,
                title: "Early Photography",
                content: `<p>Photography as we know it today began in the early 19th century, though the principles behind it had been understood for centuries. The camera obscura, a device that projects an image of its surroundings on a screen, had been known since ancient times. However, it wasn't until the 1820s that inventors found ways to permanently record these projected images.</p>
                
                <p>The French inventor Joseph Nicéphore Niépce created what is considered the first permanent photograph in 1826 or 1827. His process, called heliography, required exposure times of several hours or even days. Shortly after, Louis Daguerre developed the daguerreotype process, which reduced exposure time to minutes and produced sharper images on silver-coated copper plates. Announced in 1839, the daguerreotype became immensely popular, particularly for portrait photography.</p>
                
                <p>Meanwhile, in England, William Henry Fox Talbot was developing a different approach. His calotype process, announced in 1841, produced a negative image from which multiple positive prints could be made. This concept of negatives and positives became the foundation for modern film photography. Although daguerreotypes produced sharper images, the calotype's ability to create multiple copies made it more practical for many applications.</p>
                
                <p>Early photography faced numerous challenges. Long exposure times meant that subjects had to remain completely still, leading to the development of head braces and other supports for portrait photography. The chemicals used were often toxic and difficult to work with. The equipment was bulky and expensive, limiting photography to professionals and wealthy amateurs. Despite these obstacles, photography grew rapidly in popularity throughout the 19th century, fundamentally changing how people documented their world.</p>`,
                questions: [
                    {
                        id: 7,
                        question: "According to paragraph 2, what was one advantage of the daguerreotype over earlier photographic methods?",
                        options: [
                            "It was less expensive",
                            "It required shorter exposure times",
                            "It produced multiple copies",
                            "It used safer chemicals"
                        ],
                        correctAnswer: 1
                    },
                    {
                        id: 8,
                        question: "The word 'immensely' in paragraph 2 is closest in meaning to",
                        options: [
                            "Slightly",
                            "Gradually",
                            "Extremely",
                            "Surprisingly"
                        ],
                        correctAnswer: 2
                    },
                    {
                        id: 9,
                        question: "What can be inferred about the calotype process from paragraph 3?",
                        options: [
                            "It was invented before the daguerreotype",
                            "It was more expensive than the daguerreotype",
                            "It had some practical advantages over the daguerreotype",
                            "It produced better quality images than the daguerreotype"
                        ],
                        correctAnswer: 2
                    },
                    {
                        id: 10,
                        question: "Why does the author mention head braces in paragraph 4?",
                        options: [
                            "To illustrate a challenge of early photography",
                            "To describe how portraits were composed",
                            "To explain why photography was expensive",
                            "To compare different photographic techniques"
                        ],
                        correctAnswer: 0
                    }
                ]
            }
        ]
    },
    
    listening: {
        conversations: [
            {
                id: 1,
                title: "Student and Professor",
                audioUrl: "", // 실제 환경에서는 오디오 URL이 들어갑니다
                audioDescription: "A student talks to a professor about a research paper assignment.",
                questions: [
                    {
                        id: 1,
                        question: "What is the main purpose of the conversation?",
                        options: [
                            "To discuss the student's grade",
                            "To get clarification about an assignment",
                            "To request an extension",
                            "To change the research topic"
                        ],
                        correctAnswer: 1
                    },
                    {
                        id: 2,
                        question: "What does the professor suggest the student do?",
                        options: [
                            "Start over with a new topic",
                            "Narrow down the research focus",
                            "Work with a study group",
                            "Submit the paper late"
                        ],
                        correctAnswer: 1
                    }
                ]
            },
            {
                id: 2,
                title: "Campus Service Discussion",
                audioUrl: "",
                audioDescription: "A student inquires about library services at the campus information desk.",
                questions: [
                    {
                        id: 3,
                        question: "What is the student's main concern?",
                        options: [
                            "Finding a quiet study space",
                            "Accessing digital resources",
                            "Returning overdue books",
                            "Reserving a group study room"
                        ],
                        correctAnswer: 3
                    },
                    {
                        id: 4,
                        question: "How can the student make a reservation?",
                        options: [
                            "By calling the library",
                            "Through the library website",
                            "By visiting in person",
                            "By sending an email"
                        ],
                        correctAnswer: 1
                    }
                ]
            }
        ],
        lectures: [
            {
                id: 1,
                title: "Biology Lecture: Photosynthesis",
                audioUrl: "",
                audioDescription: "A professor explains the process of photosynthesis in plants.",
                questions: [
                    {
                        id: 5,
                        question: "What is the main topic of the lecture?",
                        options: [
                            "Plant reproduction",
                            "Cellular respiration",
                            "Photosynthesis",
                            "Plant classification"
                        ],
                        correctAnswer: 2
                    },
                    {
                        id: 6,
                        question: "According to the professor, what are the main products of photosynthesis?",
                        options: [
                            "Carbon dioxide and water",
                            "Oxygen and glucose",
                            "Nitrogen and minerals",
                            "Proteins and fats"
                        ],
                        correctAnswer: 1
                    }
                ]
            }
        ]
    },
    
    speaking: {
        tasks: [
            {
                id: 1,
                type: "independent",
                title: "Independent Speaking Task",
                prompt: "Some people prefer to live in a small town. Others prefer to live in a big city. Which place would you prefer to live in? Use specific reasons and details to support your answer.",
                preparationTime: 15,
                responseTime: 45
            },
            {
                id: 2,
                type: "integrated",
                title: "Integrated Speaking Task - Campus Announcement",
                readingText: "The university is planning to renovate the student center. The renovation will include a new cafeteria, additional study spaces, and updated technology in the computer lab. The project will begin next semester and is expected to be completed within six months.",
                listeningDescription: "Two students discuss the announcement.",
                prompt: "The man expresses his opinion about the university's plan. State his opinion and explain the reasons he gives for holding that opinion.",
                preparationTime: 30,
                responseTime: 60
            },
            {
                id: 3,
                type: "integrated",
                title: "Integrated Speaking Task - Academic Lecture",
                readingText: "Cognitive Dissonance: A psychological phenomenon that occurs when a person holds two contradictory beliefs, values, or attitudes simultaneously. This mental discomfort typically leads people to try to reduce the inconsistency.",
                listeningDescription: "Professor gives examples of cognitive dissonance.",
                prompt: "Using the examples from the lecture, explain the concept of cognitive dissonance.",
                preparationTime: 30,
                responseTime: 60
            },
            {
                id: 4,
                type: "integrated",
                title: "Integrated Speaking Task - Academic Summary",
                listeningDescription: "Professor discusses two types of market research.",
                prompt: "Using points and examples from the lecture, explain the two types of market research described by the professor.",
                preparationTime: 20,
                responseTime: 60
            }
        ]
    },
    
    writing: {
        tasks: [
            {
                id: 1,
                type: "integrated",
                title: "Integrated Writing Task",
                readingPassage: `<p>The development of renewable energy sources is often presented as the solution to climate change and energy security. Supporters argue that solar, wind, and hydroelectric power offer clean alternatives to fossil fuels. However, several concerns about renewable energy deserve careful consideration.</p>
                
                <p>First, renewable energy sources are unreliable. Solar panels only generate electricity when the sun is shining, and wind turbines require consistent wind. This intermittency means that renewable energy cannot provide the constant, dependable power supply that modern societies require. Fossil fuel plants can operate continuously, making them far more reliable.</p>
                
                <p>Second, renewable energy infrastructure is extremely expensive to build and maintain. Installing solar panels and wind farms requires massive upfront investment. The cost of manufacturing, transporting, and installing this equipment often exceeds the long-term savings on energy costs. These high costs make renewable energy economically impractical for many regions.</p>
                
                <p>Finally, renewable energy projects can have negative environmental impacts. Large-scale solar farms require vast amounts of land, potentially destroying natural habitats. Wind turbines can harm bird populations, and hydroelectric dams disrupt river ecosystems. The environmental costs of renewable energy are often overlooked by its advocates.</p>`,
                listeningDescription: "The professor discusses renewable energy, challenging the reading passage points.",
                prompt: "Summarize the points made in the lecture, being sure to explain how they challenge the specific claims made in the reading passage.",
                timeLimit: 20 // minutes
            },
            {
                id: 2,
                type: "independent",
                title: "Independent Writing Task",
                prompt: `<p>Do you agree or disagree with the following statement?</p>
                
                <p><strong>"The most important goal of education should be to teach people how to educate themselves."</strong></p>
                
                <p>Use specific reasons and examples to support your answer.</p>`,
                timeLimit: 30 // minutes
            }
        ]
    }
};

// 사용자 답안 저장
let userAnswers = {
    reading: {},
    listening: {},
    speaking: {},
    writing: {}
};

// 현재 시험 상태
let currentTest = {
    section: null,
    currentQuestion: 0,
    currentPassage: 0,
    currentTask: 0,
    startTime: null,
    answers: {},
    // 학습 일정 관련
    currentWeek: null,
    currentDay: null
};
window.currentTest = currentTest;

// 프로그램별 일정 구조
const programSchedule = {
    '내벨업챌린지 - Standard': {
        totalWeeks: 8,
        weeks: {}  // 추후 Google Sheets로 관리
    },
    '내벨업챌린지 - Fast': {
        totalWeeks: 4,
        weeks: {}  // 추후 Google Sheets로 관리
    }
};

// 요일 목록 (토요일 제외)
const daysOfWeek = ['일', '월', '화', '수', '목', '금'];

// 데모용 과제 데이터 (추후 Google Sheets로 대체)
const demoTasks = {
    '내벨업챌린지 - Standard': {
        week1: {
            일: { sections: ['reading_fillblanks'], description: 'Reading - Fill Blanks' },
            월: { sections: ['reading_daily1', 'listening_response'], description: 'Reading Daily 1 & Listening Response' },
            화: { sections: ['reading_daily2'], description: 'Reading - Daily 2' },
            수: { sections: ['reading_academic'], description: 'Reading - Academic' },
            목: { sections: ['listening_response', 'listening_conver', 'listening_announcement', 'listening_lecture'], description: 'Listening - All Types' },
            금: { sections: ['writing_arrange', 'writing_email', 'writing_discussion'], description: 'Writing - 단어배열 & 이메일 & 토론형' }
        },
        week2: {
            일: { sections: ['speaking_repeat'], description: 'Speaking - 따라말하기' },
            월: { sections: ['speaking_interview'], description: 'Speaking - 인터뷰' },
            화: { sections: ['vocab_test'], description: '내벨업보카 (p.5-6)', pages: '5-6' },
            수: { sections: ['speaking'], description: 'Speaking' },
            목: { sections: ['reading', 'listening'], description: 'Reading & Listening' },
            금: { sections: ['writing', 'speaking'], description: 'Writing & Speaking' }
        },
        week3: {
            일: { sections: ['reading', 'listening'], description: 'Reading & Listening' },
            월: { sections: ['writing'], description: 'Writing' },
            화: { sections: ['vocab_test'], description: '내벨업보카 (p.9-10)', pages: '9-10' },
            수: { sections: ['reading'], description: 'Reading' },
            목: { sections: ['listening_response', 'listening_conver', 'listening_announcement', 'listening_lecture'], description: 'Listening' },
            금: { sections: ['reading', 'listening', 'writing', 'speaking'], description: 'Full Test' }
        },
        week4: {
            일: { sections: ['reading', 'writing'], description: 'Reading & Writing' },
            월: { sections: ['listening', 'speaking'], description: 'Listening & Speaking' },
            화: { sections: ['vocab_test'], description: '내벨업보카 (p.13-14)', pages: '13-14' },
            수: { sections: ['listening_response', 'listening_conver', 'listening_announcement', 'listening_lecture'], description: 'Listening' },
            목: { sections: ['writing'], description: 'Writing' },
            금: { sections: ['reading', 'listening', 'writing', 'speaking'], description: 'Full Test' }
        },
        week5: {
            일: { sections: ['reading', 'listening'], description: 'Reading & Listening' },
            월: { sections: ['writing'], description: 'Writing' },
            화: { sections: ['vocab_test'], description: '내벨업보카 (p.17-18)', pages: '17-18' },
            수: { sections: ['reading'], description: 'Reading' },
            목: { sections: ['listening_response', 'listening_conver', 'listening_announcement', 'listening_lecture'], description: 'Listening' },
            금: { sections: ['writing', 'speaking'], description: 'Writing & Speaking' }
        },
        week6: {
            일: { sections: ['reading', 'writing'], description: 'Reading & Writing' },
            월: { sections: ['listening', 'speaking'], description: 'Listening & Speaking' },
            화: { sections: ['vocab_test'], description: '내벨업보카 (p.21-22)', pages: '21-22' },
            수: { sections: ['listening_response', 'listening_conver', 'listening_announcement', 'listening_lecture'], description: 'Listening' },
            목: { sections: ['writing'], description: 'Writing' },
            금: { sections: ['reading', 'listening', 'writing', 'speaking'], description: 'Full Test' }
        },
        week7: {
            일: { sections: ['reading', 'listening'], description: 'Reading & Listening' },
            월: { sections: ['writing'], description: 'Writing' },
            화: { sections: ['vocab_test'], description: '내벨업보카 (p.25-26)', pages: '25-26' },
            수: { sections: ['reading'], description: 'Reading' },
            목: { sections: ['listening_response', 'listening_conver', 'listening_announcement', 'listening_lecture'], description: 'Listening' },
            금: { sections: ['writing', 'speaking'], description: 'Writing & Speaking' }
        },
        week8: {
            일: { sections: ['reading', 'writing'], description: 'Reading & Writing' },
            월: { sections: ['listening', 'speaking'], description: 'Listening & Speaking' },
            화: { sections: ['vocab_test'], description: '내벨업보카 (p.29-30)', pages: '29-30' },
            수: { sections: ['listening_response', 'listening_conver', 'listening_announcement', 'listening_lecture'], description: 'Listening' },
            목: { sections: ['writing', 'speaking'], description: 'Writing & Speaking' },
            금: { sections: ['reading', 'listening', 'writing', 'speaking'], description: 'Final Test' }
        }
    },
    '내벨업챌린지 - Fast': {
        // Fast는 Standard와 동일한 과제를 4주에 걸쳐 진행 (임시 데모 데이터)
        week1: {
            일: { sections: ['reading'], description: 'Reading' },
            월: { sections: ['listening_response', 'listening_conver', 'listening_announcement', 'listening_lecture'], description: 'Listening' },
            화: { sections: ['writing'], description: 'Writing' },
            수: { sections: ['speaking'], description: 'Speaking' },
            목: { sections: ['reading', 'listening'], description: 'Reading & Listening' },
            금: { sections: ['writing', 'speaking'], description: 'Writing & Speaking' }
        },
        week2: {
            일: { sections: ['speaking_repeat'], description: 'Speaking - 따라말하기' },
            월: { sections: ['listening', 'speaking'], description: 'Listening & Speaking' },
            화: { sections: ['vocab_test'], description: '내벨업보카 (p.5-8)', pages: '5-8' },
            수: { sections: ['listening_response', 'listening_conver', 'listening_announcement', 'listening_lecture'], description: 'Listening' },
            목: { sections: ['writing'], description: 'Writing' },
            금: { sections: ['speaking'], description: 'Speaking' }
        },
        week3: {
            일: { sections: ['reading', 'listening'], description: 'Reading & Listening' },
            월: { sections: ['writing'], description: 'Writing' },
            화: { sections: ['vocab_test'], description: '내벨업보카 (p.9-12)', pages: '9-12' },
            수: { sections: ['reading'], description: 'Reading' },
            목: { sections: ['listening_response', 'listening_conver', 'listening_announcement', 'listening_lecture'], description: 'Listening' },
            금: { sections: ['reading', 'listening', 'writing', 'speaking'], description: 'Full Test' }
        },
        week4: {
            일: { sections: ['reading', 'writing'], description: 'Reading & Writing' },
            월: { sections: ['listening', 'speaking'], description: 'Listening & Speaking' },
            화: { sections: ['vocab_test'], description: '내벨업보카 (p.13-16)', pages: '13-16' },
            수: { sections: ['listening_response', 'listening_conver', 'listening_announcement', 'listening_lecture'], description: 'Listening' },
            목: { sections: ['writing'], description: 'Writing' },
            금: { sections: ['reading', 'listening', 'writing', 'speaking'], description: 'Final Test' }
        }
    }
};
