const jwt=require('jsonwebtoken');
function auth(req,res,next){const h=req.headers.authorization;if(!h||!h.startsWith('Bearer '))return res.status(401).json({error:'Token not provided'});try{const d=jwt.verify(h.split(' ')[1],process.env.JWT_SECRET);req.user=d;next()}catch {res.status(401).json({error:'Invalid token'})}}
module.exports=auth;